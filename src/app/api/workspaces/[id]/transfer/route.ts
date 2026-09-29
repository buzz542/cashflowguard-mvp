import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { subscriptionIsActive } from "@/lib/entitlements";
import { UUID_RE } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "Not found."],
  not_owner: [403, "Only the team owner can hand the team over."],
  personal: [400, "Personal workspaces can't be handed over."],
  not_member: [400, "They need to be in the team first."]
};

/** Hand a team to another member `{ userId }`. Not while it has a live subscription (the card is the owner's). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(404, "Not found.");
  const body = await req.json().catch(() => ({}));
  if (typeof body.userId !== "string" || !UUID_RE.test(body.userId) || body.userId === auth.user.id) {
    return jsonError(400, "Pick someone else in the team.");
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: sub } = await admin.from("subscriptions").select("status").eq("workspace_id", params.id).maybeSingle();
    if (subscriptionIsActive(sub?.status as string | null)) {
      return jsonError(409, "Cancel the team plan in Manage billing first; the new owner can then buy seats with their own card.", "active_subscription");
    }
    const { data, error } = await admin.rpc("transfer_workspace", { p_workspace_id: params.id, p_from: auth.user.id, p_to: body.userId });
    if (error) throw new Error(error.message);
    if (data !== "ok") {
      const [status, msg] = MESSAGES[data as string] ?? [400, "Could not hand the team over."];
      return jsonError(status, msg, data as string);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("transfer:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not hand the team over.");
  }
}
