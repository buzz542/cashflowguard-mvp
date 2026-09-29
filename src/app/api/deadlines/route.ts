import { NextRequest, NextResponse } from "next/server";
import { requireUser, loadWorkspaceContext, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OBLIGATION_COLUMNS } from "@/lib/reminderScheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tracked deadlines (confirmed) for the active workspace, soonest first, plus the jobs they belong to. */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  try {
    const ctx = await loadWorkspaceContext(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
    const supabase = createSupabaseServerClient();
    const [{ data: obligations, error: oErr }, { data: jobs, error: jErr }] = await Promise.all([
      supabase
        .from("obligations")
        .select(OBLIGATION_COLUMNS)
        .eq("workspace_id", ctx.workspace.id)
        .eq("status", "confirmed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("jobs")
        .select("id, name, jurisdiction, created_at")
        .eq("workspace_id", ctx.workspace.id)
        .order("created_at", { ascending: false })
    ]);
    if (oErr || jErr) throw new Error((oErr ?? jErr)!.message);
    return NextResponse.json({ obligations: obligations ?? [], jobs: jobs ?? [] });
  } catch (e) {
    console.error("deadlines:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not load your deadlines.");
  }
}
