import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser, loadWorkspaceContext, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { subscriptionIsActive } from "@/lib/entitlements";
import { appOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Start a Stripe Checkout for the active workspace. One Stripe customer per workspace. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const rl = rateLimit(`checkout:${auth.user.id}`, 10, 60_000);
    if (!rl.ok) return jsonError(429, "Too many requests. Try again shortly.");

    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!stripe || !priceId) return jsonError(500, "Payments are not configured.");

    const ctx = await loadWorkspaceContext(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
    if (ctx.workspace.role !== "owner") return jsonError(403, "Only the workspace owner can manage billing.");
    if (ctx.isPro && subscriptionIsActive(ctx.subscription?.status)) {
      return jsonError(409, "You're already on Pro. Use Manage billing to change your plan.", "already_subscribed");
    }

    const admin = getSupabaseAdmin();
    let customerId = ctx.subscription?.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.email,
        metadata: { workspace_id: ctx.workspace.id, app: "guardconstruct" }
      });
      // If two checkouts race, the first stored customer wins and we use that one.
      await admin
        .from("subscriptions")
        .upsert({ workspace_id: ctx.workspace.id, stripe_customer_id: customer.id }, { onConflict: "workspace_id", ignoreDuplicates: true });
      const { data } = await admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("workspace_id", ctx.workspace.id)
        .single();
      customerId = (data?.stripe_customer_id as string | null) ?? customer.id;
      if (customerId !== customer.id) await stripe.customers.del(customer.id).catch(() => undefined);
    }

    const origin = appOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: ctx.workspace.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { app: "guardconstruct", plan: "pro", workspace_id: ctx.workspace.id },
      subscription_data: { metadata: { workspace_id: ctx.workspace.id } }
    });

    if (!session.url) return jsonError(500, "Checkout unavailable.");
    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Checkout error:", error instanceof Error ? error.message : error);
    return jsonError(500, "Checkout failed. Please try again.");
  }
}
