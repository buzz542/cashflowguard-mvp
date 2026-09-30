import { NextResponse } from "next/server";
import { requireUser, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hashInviteToken, looksLikeInviteToken, ACCEPT_MESSAGES } from "@/lib/invites";
import { rateLimit } from "@/lib/rateLimit";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Accept a team invite `{ token }`. The signed-in email must match the invited one. */
export async function POST(req: Request) {
  if (!config.teamsEnabled) return jsonError(404, "Teams aren't available yet.");
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const rl = rateLimit(`accept:${auth.user.id}`, 20, 60 * 60 * 1000);
  if (!rl.ok) return jsonError(429, "Too many attempts. Try again later.");

  const body = await req.json().catch(() => ({}));
  if (!looksLikeInviteToken(body.token)) return jsonError(404, ACCEPT_MESSAGES.invalid.error, "invalid");

  const { data, error } = await getSupabaseAdmin().rpc("accept_workspace_invite", {
    p_token_hash: hashInviteToken(body.token),
    p_user_id: auth.user.id,
    p_email: auth.email,
    p_max_members: config.maxTeamSeats
  });
  if (error) {
    console.error("accept invite:", error.message);
    return jsonError(500, "Could not accept the invite.");
  }
  const row = (Array.isArray(data) ? data[0] : data) as { status: string; workspace_id: string | null } | null;
  const status = row?.status ?? "invalid";
  if (status !== "ok" && status !== "already_member") {
    const m = ACCEPT_MESSAGES[status] ?? ACCEPT_MESSAGES.invalid;
    return jsonError(m.status, m.error, status);
  }

  const res = NextResponse.json({ ok: true, workspaceId: row!.workspace_id, status });
  if (row?.workspace_id) {
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, row.workspace_id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
