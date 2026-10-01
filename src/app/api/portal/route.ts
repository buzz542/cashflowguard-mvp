import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser, loadWorkspaceContext, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { appOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe Customer Portal for the active workspace. The customer comes from our own
 * database, keyed by the signed-in owner's workspace: never from anything the client sends.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const rl = rateLimit(`portal:${auth.user.id}`, 10, 60_000);
    if (!rl.ok) return jsonError(429, "Too many requests. Try again shortly.");

    const stripe = getStripe();
    if (!stripe) return jsonError(500, "Billing is not configured.");

    const ctx = await loadWorkspaceContext(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
    if (ctx.workspace.role !== "owner") return jsonError(403, "Only the workspace owner can manage billing.");
    const customer = ctx.subscription?.stripeCustomerId;
    if (!customer) return jsonError(404, "No billing account yet. Subscribe first.");

    const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${appOrigin(req)}/` });
    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Portal error:", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not open billing portal.");
  }
}
