import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscriptionIsActive } from "./entitlements";

export type SubscriptionRow = {
  workspace_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  price_id: string | null;
  seat_count: number;
  current_period_end: string | null;
};

type Snapshot = Omit<SubscriptionRow, "workspace_id"> & { metadataWorkspaceId: string | null };

export function snapshotSubscription(sub: Stripe.Subscription): Snapshot {
  const items = sub.items?.data ?? [];
  const seats = items.reduce((n, it) => n + (it.quantity ?? 0), 0);
  // Newer Stripe API versions move the period onto items; read either.
  const itemPeriodEnd = (items[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? itemPeriodEnd;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  return {
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: items[0]?.price?.id ?? null,
    seat_count: Math.max(1, seats),
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    metadataWorkspaceId: sub.metadata?.workspace_id || null
  };
}

/**
 * A workspace holds one subscription row. If someone ends up with two Stripe
 * subscriptions (double checkout), don't let a cancellation event for the old one
 * overwrite the live one.
 */
export function shouldReplaceSubscription(
  existing: Pick<SubscriptionRow, "stripe_subscription_id" | "status"> | null,
  incoming: Pick<SubscriptionRow, "stripe_subscription_id" | "status">
): boolean {
  if (!existing || !existing.stripe_subscription_id) return true;
  if (existing.stripe_subscription_id === incoming.stripe_subscription_id) return true;
  if (subscriptionIsActive(existing.status) && !subscriptionIsActive(incoming.status)) return false;
  return true;
}

/**
 * Which subscription an event is about, if any. Invoices carry it as `subscription`
 * (API 2025-02-24) or under `parent.subscription_details` (newer API versions).
 */
export function subscriptionIdFromEvent(event: { type: string; data: { object: unknown } }): string | null {
  const obj = event.data.object as Record<string, unknown>;
  const idOf = (v: unknown): string | null =>
    typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;
  if (event.type === "checkout.session.completed") return idOf(obj.subscription);
  if (SUBSCRIPTION_EVENTS.has(event.type)) return idOf(obj.id);
  if (event.type === "invoice.payment_failed") {
    const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
    return idOf(obj.subscription) ?? idOf(parent?.subscription_details?.subscription);
  }
  return null;
}

/** Events that change who has Pro. */
export const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed"
]);

/** Pull a subscription from Stripe and mirror it into Postgres. Idempotent. */
export async function syncSubscription(
  stripe: Stripe,
  admin: SupabaseClient,
  subscriptionId: string
): Promise<{ workspaceId: string | null; status: string | null }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const snap = snapshotSubscription(sub);

  let workspaceId = snap.metadataWorkspaceId;
  if (!workspaceId && snap.stripe_customer_id) {
    const { data } = await admin
      .from("subscriptions")
      .select("workspace_id")
      .eq("stripe_customer_id", snap.stripe_customer_id)
      .maybeSingle();
    workspaceId = (data?.workspace_id as string | undefined) ?? null;
  }
  if (!workspaceId) {
    console.error("syncSubscription: no workspace for subscription", sub.id);
    return { workspaceId: null, status: snap.status };
  }

  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!shouldReplaceSubscription(existing as SubscriptionRow | null, snap)) {
    return { workspaceId, status: (existing?.status as string | null) ?? null };
  }

  const { metadataWorkspaceId: _ignored, ...row } = snap;
  const { error } = await admin
    .from("subscriptions")
    .upsert({ workspace_id: workspaceId, ...row, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) throw new Error(`syncSubscription upsert failed: ${error.message}`);

  return { workspaceId, status: snap.status };
}
