import { NextResponse } from "next/server";
import { requireUser, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { roleIn, UUID_RE } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Switch the active workspace `{ workspaceId }`. Only to one the caller belongs to. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  const id = typeof body.workspaceId === "string" && UUID_RE.test(body.workspaceId) ? body.workspaceId : null;
  if (!id || !(await roleIn(getSupabaseAdmin(), id, auth.user.id))) return jsonError(404, "Workspace not found.");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
