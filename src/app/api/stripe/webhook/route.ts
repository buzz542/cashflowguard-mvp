import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { syncSubscription, subscriptionIdFromEvent } from "@/lib/stripeSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe → Postgres subscription mirror. Signature-verified. We re-fetch the
 * subscription instead of trusting the event body, so event ordering doesn't matter.
 * Grants Pro on checkout.session.completed; revokes it on customer.subscription.updated /
 * deleted and invoice.payment_failed (the re-fetched status is then past_due, unpaid or
 * canceled, none of which is Pro).
 * A non-2xx makes Stripe retry, which is what we want on transient failures.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const subscriptionId = subscriptionIdFromEvent(event);
    if (subscriptionId) await syncSubscription(stripe, getSupabaseAdmin(), subscriptionId);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(`Webhook ${event.type} failed:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
