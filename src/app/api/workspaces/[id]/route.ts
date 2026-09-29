import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { subscriptionIsActive } from "@/lib/entitlements";
import { UUID_RE } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Delete a team workspace `{ confirm: <team name> }` (owner only). Removes its reviews,
 * jobs, deadlines and reminders for everyone. Not while it has a live subscription.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(404, "Not found.");
  const body = await req.json().catch(() => ({}));

  try {
    const admin = getSupabaseAdmin();
    const { data: ws } = await admin.from("workspaces").select("id, name, personal, owner_id").eq("id", params.id).maybeSingle();
    if (!ws || ws.owner_id !== auth.user.id) return jsonError(404, "Not found.");
    if (ws.personal) return jsonError(400, "Your personal workspace can't be deleted (delete your account instead).");
    if (body?.confirm !== ws.name) return jsonError(400, "Type the team name to confirm.", "confirm_required");

    const { data: sub } = await admin.from("subscriptions").select("status").eq("workspace_id", params.id).maybeSingle();
    if (subscriptionIsActive(sub?.status as string | null)) {
      return jsonError(409, "Cancel the team plan in Manage billing first.", "active_subscription");
    }
    const { error } = await admin.from("workspaces").delete().eq("id", params.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("delete team:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not delete the team.");
  }
}
