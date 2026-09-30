import { NextRequest, NextResponse } from "next/server";
import { requireUser, loadWorkspaceContext, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isJurisdiction } from "@/lib/bankHolidays";
import { remindersAllowed } from "@/lib/reminderScheduler";
import { roleIn, UUID_RE } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Create a project: `{ name, jurisdiction, reviewId? }`. With `reviewId`, the reviewed contract
 * and its extracted deadlines are attached to it; without, it starts empty for the user's own items.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  try {
    const ctx = await loadWorkspaceContext(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
    if (!remindersAllowed(ctx.isPro)) return jsonError(402, "Deadline reminders are part of Pro.", "upgrade_required");

    const body = await req.json().catch(() => ({}));
    const reviewId = typeof body.reviewId === "string" && UUID_RE.test(body.reviewId) ? body.reviewId : null;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const jurisdiction = isJurisdiction(body.jurisdiction) ? body.jurisdiction : "england-and-wales";
    if (!name) return jsonError(400, "Give the project a name.");

    const admin = getSupabaseAdmin();
    if (!reviewId) {
      const { data: job, error } = await admin
        .from("jobs")
        .insert({ workspace_id: ctx.workspace.id, created_by: auth.user.id, name, jurisdiction })
        .select("id, name, jurisdiction, created_at")
        .single();
      if (error || !job) throw new Error(error?.message ?? "job insert failed");
      return NextResponse.json({ job });
    }
    const { data: review } = await admin.from("reviews").select("id, workspace_id, job_id").eq("id", reviewId).maybeSingle();
    if (!review || !(await roleIn(admin, review.workspace_id, auth.user.id))) return jsonError(404, "Review not found.");
    if (review.job_id) return jsonError(409, "This contract is already being tracked.", "already_tracked");

    const { data: job, error } = await admin
      .from("jobs")
      .insert({ workspace_id: review.workspace_id, created_by: auth.user.id, name, jurisdiction })
      .select("id, name, jurisdiction, created_at")
      .single();
    if (error || !job) throw new Error(error?.message ?? "job insert failed");

    await admin.from("reviews").update({ job_id: job.id }).eq("id", reviewId);
    await admin.from("obligations").update({ job_id: job.id }).eq("review_id", reviewId);

    return NextResponse.json({ job });
  } catch (e) {
    console.error("create job:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not start tracking this job.");
  }
}
