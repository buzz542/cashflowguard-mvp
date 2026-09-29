import { NextRequest, NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/stripeSync";
import { subscriptionIsActive } from "@/lib/entitlements";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Called when the user lands back from Checkout. Syncs the subscription straight away
 * so they don't wait on the webhook, but only for a workspace they belong to.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const stripe = getStripe();
    if (!stripe) return jsonError(500, "Billing not configured.");

    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId || !sessionId.startsWith("cs_") || sessionId.length > 200) {
      return jsonError(400, "Invalid session.");
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const workspaceId = session.client_reference_id || session.metadata?.workspace_id;
    if (!workspaceId) return jsonError(404, "Unknown checkout.");

    const { data: membership } = await getSupabaseAdmin()
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!membership) return jsonError(404, "Unknown checkout.");

    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subId) return NextResponse.json({ pro: false });

    const { status } = await syncSubscription(stripe, getSupabaseAdmin(), subId);
    return NextResponse.json({ pro: subscriptionIsActive(status) });
  } catch (error: unknown) {
    console.error("Verify error:", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not verify payment.");
  }
}
