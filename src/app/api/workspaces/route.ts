import { NextResponse } from "next/server";
import { requireUser, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Create a team workspace `{ name }` owned by the caller, and switch to it. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return jsonError(400, "Give the team a name.");

  try {
    const admin = getSupabaseAdmin();
    const { count } = await admin
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", auth.user.id)
      .eq("personal", false);
    if ((count ?? 0) >= config.maxOwnedTeams) {
      return jsonError(409, `You can own up to ${config.maxOwnedTeams} teams.`, "team_limit");
    }

    const { data: ws, error } = await admin
      .from("workspaces")
      .insert({ name, owner_id: auth.user.id, personal: false })
      .select("id, name, personal")
      .single();
    if (error || !ws) throw new Error(error?.message ?? "insert failed");
    const { error: mErr } = await admin
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: auth.user.id, role: "owner" });
    if (mErr) {
      await admin.from("workspaces").delete().eq("id", ws.id);
      throw new Error(mErr.message);
    }

    const res = NextResponse.json({ workspace: { ...ws, role: "owner" } });
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, ws.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (e) {
    console.error("create team:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not create the team.");
  }
}
