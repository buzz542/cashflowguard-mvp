import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { snapshotSubscription, shouldReplaceSubscription, subscriptionIdFromEvent } from "@/lib/stripeSync";
import { subscriptionIsActive } from "@/lib/entitlements";

const sub = (over: Record<string, unknown> = {}) =>
  ({
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    current_period_end: 1790000000,
    metadata: { workspace_id: "ws_1" },
    items: { data: [{ quantity: 3, price: { id: "price_1" } }] },
    ...over
  }) as unknown as Stripe.Subscription;

describe("snapshotSubscription", () => {
  it("maps the fields we store", () => {
    const s = snapshotSubscription(sub());
    expect(s).toMatchObject({
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      status: "active",
      price_id: "price_1",
      seat_count: 3,
      metadataWorkspaceId: "ws_1"
    });
    expect(s.current_period_end).toBe(new Date(1790000000 * 1000).toISOString());
  });
  it("reads period end from items on newer API versions", () => {
    const s = snapshotSubscription(sub({ current_period_end: undefined, items: { data: [{ quantity: 1, price: { id: "p" }, current_period_end: 1800000000 }] } }));
    expect(s.current_period_end).toBe(new Date(1800000000 * 1000).toISOString());
  });
  it("expanded customer object and missing metadata", () => {
    const s = snapshotSubscription(sub({ customer: { id: "cus_x" }, metadata: {} }));
    expect(s.stripe_customer_id).toBe("cus_x");
    expect(s.metadataWorkspaceId).toBeNull();
  });
  it("never reports fewer than one seat", () => {
    expect(snapshotSubscription(sub({ items: { data: [] } })).seat_count).toBe(1);
  });
});

describe("shouldReplaceSubscription", () => {
  it("replaces when nothing stored", () => expect(shouldReplaceSubscription(null, { stripe_subscription_id: "a", status: "active" })).toBe(true));
  it("replaces same subscription whatever its status", () =>
    expect(shouldReplaceSubscription({ stripe_subscription_id: "a", status: "active" }, { stripe_subscription_id: "a", status: "canceled" })).toBe(true));
  it("does not let an old cancelled sub overwrite a live one", () =>
    expect(shouldReplaceSubscription({ stripe_subscription_id: "live", status: "active" }, { stripe_subscription_id: "old", status: "canceled" })).toBe(false));
  it("lets a new active sub replace a dead one", () =>
    expect(shouldReplaceSubscription({ stripe_subscription_id: "old", status: "canceled" }, { stripe_subscription_id: "new", status: "active" })).toBe(true));
  it("replaces a customer-only placeholder row", () =>
    expect(shouldReplaceSubscription({ stripe_subscription_id: null, status: null }, { stripe_subscription_id: "a", status: "incomplete" })).toBe(true));
});

describe("subscriptionIdFromEvent", () => {
  const ev = (type: string, object: unknown) => ({ type, data: { object } });
  it("grants on checkout completion", () => {
    expect(subscriptionIdFromEvent(ev("checkout.session.completed", { subscription: "sub_1" }))).toBe("sub_1");
    expect(subscriptionIdFromEvent(ev("checkout.session.completed", { subscription: { id: "sub_2" } }))).toBe("sub_2");
  });
  it("follows subscription updates and deletion", () => {
    expect(subscriptionIdFromEvent(ev("customer.subscription.updated", { id: "sub_1" }))).toBe("sub_1");
    expect(subscriptionIdFromEvent(ev("customer.subscription.deleted", { id: "sub_1" }))).toBe("sub_1");
  });
  it("re-syncs on a failed payment (both invoice shapes)", () => {
    expect(subscriptionIdFromEvent(ev("invoice.payment_failed", { subscription: "sub_3" }))).toBe("sub_3");
    expect(subscriptionIdFromEvent(ev("invoice.payment_failed", { subscription: null, parent: { subscription_details: { subscription: "sub_4" } } }))).toBe("sub_4");
    expect(subscriptionIdFromEvent(ev("invoice.payment_failed", { subscription: null, parent: null }))).toBeNull();
  });
  it("ignores everything else", () => {
    expect(subscriptionIdFromEvent(ev("invoice.paid", { subscription: "sub_1" }))).toBeNull();
    expect(subscriptionIdFromEvent(ev("customer.created", { id: "cus_1" }))).toBeNull();
  });
  it("a failed payment's re-fetched status is not Pro", () => {
    expect(subscriptionIsActive("past_due")).toBe(false);
    expect(subscriptionIsActive("unpaid")).toBe(false);
    expect(subscriptionIsActive("canceled")).toBe(false);
    expect(subscriptionIsActive("active")).toBe(true);
  });
});

import { stripeKeyAllowed } from "@/lib/stripe";
describe("stripeKeyAllowed", () => {
  it("test keys anywhere, live keys only in production", () => {
    expect(stripeKeyAllowed("sk_test_x", {})).toBe(true);
    expect(stripeKeyAllowed("sk_live_x", { VERCEL_ENV: "production" })).toBe(true);
    expect(stripeKeyAllowed("sk_live_x", { VERCEL_ENV: "preview" })).toBe(false);
    expect(stripeKeyAllowed("rk_live_x", { VERCEL_ENV: "development" })).toBe(false);
    expect(stripeKeyAllowed("sk_live_x", { NODE_ENV: "development" })).toBe(false);
    expect(stripeKeyAllowed("sk_live_x", { NODE_ENV: "production" })).toBe(false);
    expect(stripeKeyAllowed("sk_live_x", { NODE_ENV: "production", STRIPE_ALLOW_LIVE: "true" })).toBe(true);
  });
});
