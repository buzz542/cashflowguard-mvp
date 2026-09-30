import { NextRequest, NextResponse } from "next/server";
import { requireUser, loadWorkspaceContext, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isIsoDate, addCalendarDays, compareDates, ukToday } from "@/lib/deadlines";
import { remindersAllowed, rescheduleObligation } from "@/lib/reminderScheduler";
import { roleIn, UUID_RE } from "@/lib/membership";
import { rateLimit } from "@/lib/rateLimit";
import { MANUAL_KINDS } from "@/lib/obligationKinds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Add your own dated item to a project:
 *   { jobId, kind, title, date: "YYYY-MM-DD", repeat?: "none" | "monthly", notes? }
 * Tracked straight away (status confirmed), with reminders.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!rateLimit(`items:${auth.user.id}`, 120, 60 * 60 * 1000).ok) return jsonError(429, "Too many changes in a short time. Please try again later.");
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body.jobId === "string" && UUID_RE.test(body.jobId) ? body.jobId : null;
    const kind = (MANUAL_KINDS as readonly string[]).includes(body.kind) ? (body.kind as string) : null;
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 600) : "";
    const monthly = body.repeat === "monthly";
    if (!jobId) return jsonError(400, "Pick a project.");
    if (!kind) return jsonError(400, "Pick what kind of date this is.");
    if (!title) return jsonError(400, "Give it a short name.");
    if (!isIsoDate(body.date)) return jsonError(400, "Enter a valid date.");

    const admin = getSupabaseAdmin();
    const { data: job } = await admin.from("jobs").select("id, workspace_id").eq("id", jobId).maybeSingle();
    if (!job || !(await roleIn(admin, job.workspace_id, auth.user.id))) return jsonError(404, "Project not found.");

    const ctx = await loadWorkspaceContext(auth.user, auth.email, job.workspace_id);
    if (ctx.workspace.id !== job.workspace_id) return jsonError(404, "Project not found.");
    if (!remindersAllowed(ctx.isPro)) return jsonError(402, "Project tracking is part of Pro.", "upgrade_required");

    const date = body.date as string;
    const { data: row, error } = await admin
      .from("obligations")
      .insert({
        workspace_id: job.workspace_id,
        job_id: job.id,
        review_id: null,
        source: "manual",
        kind,
        title,
        source_quote: notes,
        trigger: monthly ? "monthly" : "fixed_date",
        fixed_date: monthly ? null : date,
        day_of_month: monthly ? Number(date.slice(8, 10)) : null,
        day_basis: "calendar",
        // A repeating item starting later: the first one is on the date given, not this month's.
        done_through: monthly && compareDates(date, ukToday()) > 0 ? addCalendarDays(date, -1) : null,
        status: "confirmed",
        extraction_version: "manual"
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "insert failed");

    const obligation = await rescheduleObligation(admin, row.id as string);
    return NextResponse.json({ obligation });
  } catch (e) {
    console.error("add item:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not add this date.");
  }
}
