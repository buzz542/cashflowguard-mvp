import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { roleIn, UUID_RE } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Revoke a pending invite (owner). */
export async function DELETE(_req: Request, { params }: { params: { id: string; inviteId: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.inviteId)) return jsonError(404, "Not found.");
  const admin = getSupabaseAdmin();
  if ((await roleIn(admin, params.id, auth.user.id)) !== "owner") return jsonError(403, "Only the team owner can revoke invites.");
  const { error } = await admin
    .from("workspace_invites")
    .delete()
    .eq("id", params.inviteId)
    .eq("workspace_id", params.id)
    .is("accepted_at", null);
  if (error) {
    console.error("revoke invite:", error.message);
    return jsonError(500, "Could not revoke the invite.");
  }
  return NextResponse.json({ ok: true });
}
