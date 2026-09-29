import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { roleIn, UUID_RE } from "@/lib/membership";
import { reassignAfterMemberLeft } from "@/lib/reminderScheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Remove a member (owner) or leave (yourself). The owner can't leave their own team.
 * Their reviews stay with the team; their deadlines and reminders are re-routed.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string; userId: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.userId)) return jsonError(404, "Not found.");

  try {
    const admin = getSupabaseAdmin();
    const callerRole = await roleIn(admin, params.id, auth.user.id);
    if (!callerRole) return jsonError(404, "Not found.");
    const targetRole = await roleIn(admin, params.id, params.userId);
    if (!targetRole) return jsonError(404, "Not a member.");

    const self = params.userId === auth.user.id;
    if (targetRole === "owner") return jsonError(400, "The owner can't be removed from their own team.");
    if (!self && callerRole !== "owner") return jsonError(403, "Only the team owner can remove people.");

    const { error } = await admin.from("workspace_members").delete().eq("workspace_id", params.id).eq("user_id", params.userId);
    if (error) throw new Error(error.message);
    await reassignAfterMemberLeft(admin, params.id, params.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("remove member:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not remove this member.");
  }
}
