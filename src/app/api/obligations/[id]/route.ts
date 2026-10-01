import { NextRequest, NextResponse } from "next/server";
import { requireUser, loadWorkspaceContext, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/deadlines";
import { remindersAllowed, rescheduleObligation } from "@/lib/reminderScheduler";
import { roleIn, UUID_RE } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = new Set(["suggested", "confirmed", "dismissed", "done"]);

/**
 * Update one tracked item:
 *   status     "confirmed" | "dismissed" | "suggested" | "done"
 *              ("done" on a monthly item marks this month done and moves on to the next;
 *               "confirmed" on a done item reopens it)
 *   eventDate  "YYYY-MM-DD" | null   (when the triggering event happened / will happen)
 *   dueDate    "YYYY-MM-DD" | null   (user's own date, overrides the calculation; null clears it)
 *   assigneeId uuid | null           (teammate who gets the reminders; null = whoever started tracking)
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(404, "Not found.");

  try {
    const admin = getSupabaseAdmin();
    const { data: o } = await admin
      .from("obligations")
      .select("id, workspace_id, job_id, status, trigger, due_basis, due_date")
      .eq("id", params.id)
      .maybeSingle();
    if (!o || !(await roleIn(admin, o.workspace_id, auth.user.id))) return jsonError(404, "Not found.");

    // Entitlement is checked against the obligation's own workspace.
    const ctx = await loadWorkspaceContext(auth.user, auth.email, o.workspace_id);
    if (ctx.workspace.id !== o.workspace_id) return jsonError(404, "Not found.");
    if (!remindersAllowed(ctx.isPro)) return jsonError(402, "Deadline reminders are part of Pro.", "upgrade_required");

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!STATUSES.has(body.status)) return jsonError(400, "Invalid status.");
      if ((body.status === "confirmed" || body.status === "done") && !o.job_id) {
        return jsonError(409, "Start tracking this job first.", "needs_job");
      }
      if (body.status === "done" && o.trigger === "monthly") {
        // Repeating item: this month's is done; it stays tracked for next month.
        if (!o.due_date) return jsonError(409, "Nothing due yet to mark done.");
        patch.status = "confirmed";
        patch.done_through = o.due_date;
        if (o.due_basis === "manual") {
          patch.due_date = null;
          patch.due_basis = null;
        }
      } else {
        patch.status = body.status;
        patch.completed_at = body.status === "done" ? new Date().toISOString() : null;
      }
    }
    if (body.eventDate !== undefined) {
      if (body.eventDate !== null && !isIsoDate(body.eventDate)) return jsonError(400, "Invalid date.");
      if (o.trigger !== "event" && body.eventDate !== null) return jsonError(400, "This deadline isn't tied to an event.");
      patch.event_date = body.eventDate;
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null) {
        // Clearing a manual date: let the calculation take over again.
        if (o.due_basis === "manual") {
          patch.due_date = null;
          patch.due_basis = null;
        }
      } else if (isIsoDate(body.dueDate)) {
        patch.due_date = body.dueDate;
        patch.due_basis = "manual";
      } else {
        return jsonError(400, "Invalid date.");
      }
    }
    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null) {
        patch.assignee_id = null;
      } else if (typeof body.assigneeId === "string" && UUID_RE.test(body.assigneeId) && (await roleIn(admin, o.workspace_id, body.assigneeId))) {
        patch.assignee_id = body.assigneeId;
      } else {
        return jsonError(400, "They're not in this workspace.");
      }
    }
    if (!Object.keys(patch).length) return jsonError(400, "Nothing to change.");

    const { error } = await admin.from("obligations").update(patch).eq("id", params.id);
    if (error) throw new Error(error.message);

    const obligation = await rescheduleObligation(admin, params.id);
    return NextResponse.json({ obligation });
  } catch (e) {
    console.error("update obligation:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not update this deadline.");
  }
}
