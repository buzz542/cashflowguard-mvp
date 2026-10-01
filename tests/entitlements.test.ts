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

import { memberRanks } from "@/lib/entitlements";

describe("memberRanks", () => {
  it("owner first, then by join date, whatever order rows arrive in", () => {
    const r = memberRanks("owner", [
      { user_id: "c", created_at: "2026-09-03T00:00:00Z" },
      { user_id: "owner", created_at: "2026-09-05T00:00:00Z" },
      { user_id: "a", created_at: "2026-09-01T00:00:00Z" },
      { user_id: "b", created_at: "2026-09-02T00:00:00Z" }
    ]);
    expect(Array.from(r.entries())).toEqual([["owner", 0], ["a", 1], ["b", 2], ["c", 3]]);
  });
  it("with 2 paid seats, only owner + first joiner are Pro", () => {
    const r = memberRanks("owner", [
      { user_id: "late", created_at: "2026-09-02T00:00:00Z" },
      { user_id: "early", created_at: "2026-09-01T00:00:00Z" }
    ]);
    const pro = (u: string) => isProInWorkspace({ compPro: false, subscriptionStatus: "active", seatCount: 2, memberRank: r.get(u) ?? -1 });
    expect([pro("owner"), pro("early"), pro("late"), pro("stranger")]).toEqual([true, true, false, false]);
  });
});

import { clampSeats } from "@/lib/entitlements";

describe("clampSeats", () => {
  it("never below current members, never above the cap", () => {
    expect(clampSeats(5, 3, 25)).toBe(5);
    expect(clampSeats(2, 3, 25)).toBe(3);
    expect(clampSeats(40, 3, 25)).toBe(25);
    expect(clampSeats(undefined, 4, 25)).toBe(4);
    expect(clampSeats("7", 1, 25)).toBe(1);
    expect(clampSeats(0, 0, 25)).toBe(1);
    expect(clampSeats(2.5, 1, 25)).toBe(1);
  });
});
