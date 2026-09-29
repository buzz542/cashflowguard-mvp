import { describe, it, expect } from "vitest";
import { isProInWorkspace, subscriptionIsActive } from "@/lib/entitlements";

describe("subscriptionIsActive", () => {
  it("accepts active and trialing only", () => {
    expect(subscriptionIsActive("active")).toBe(true);
    expect(subscriptionIsActive("trialing")).toBe(true);
    for (const s of ["past_due", "canceled", "incomplete", "unpaid", "paused", null, undefined, ""]) {
      expect(subscriptionIsActive(s as string)).toBe(false);
    }
  });
});

describe("isProInWorkspace", () => {
  const base = { compPro: false, subscriptionStatus: "active", seatCount: 1, memberRank: 0 };
  it("owner of an active sub is Pro", () => expect(isProInWorkspace(base)).toBe(true));
  it("cancelled sub is not Pro", () => expect(isProInWorkspace({ ...base, subscriptionStatus: "canceled" })).toBe(false));
  it("no sub is not Pro", () => expect(isProInWorkspace({ ...base, subscriptionStatus: null })).toBe(false));
  it("comp_pro is Pro with no sub", () => expect(isProInWorkspace({ ...base, compPro: true, subscriptionStatus: null })).toBe(true));
  it("members beyond paid seats are not Pro", () => {
    expect(isProInWorkspace({ ...base, seatCount: 3, memberRank: 2 })).toBe(true);
    expect(isProInWorkspace({ ...base, seatCount: 3, memberRank: 3 })).toBe(false);
  });
  it("non-members are not Pro", () => expect(isProInWorkspace({ ...base, memberRank: -1 })).toBe(false));
});
