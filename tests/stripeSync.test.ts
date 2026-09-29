import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { snapshotSubscription, shouldReplaceSubscription } from "@/lib/stripeSync";

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
