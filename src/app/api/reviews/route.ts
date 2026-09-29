import { NextRequest, NextResponse } from "next/server";
import { requireUser, loadWorkspaceContext, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Review history for the active workspace, newest first. Read through RLS as the user. */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  try {
    const ctx = await loadWorkspaceContext(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
    const { data, error } = await createSupabaseServerClient()
      .from("reviews")
      .select("id, created_at, trade, role, project_size, duration, author_id")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ reviews: data ?? [] });
  } catch (e) {
    console.error("list reviews:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not load your reviews.");
  }
}
