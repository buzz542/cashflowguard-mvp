import { describe, it, expect } from "vitest";
import { score } from "@/lib/evalScore";
import type { Obligation } from "@/lib/obligations";
import { FIXTURES } from "../evals/extractionFixtures";

const ob = (o: Partial<Obligation>): Obligation => ({
  kind: "other", title: "t", clause_ref: null, source_quote: "q", trigger: "event", fixed_date: null, day_of_month: null,
  event_description: "e", offset_days: 7, direction: "after", day_basis: "unspecified", ...o
});

describe("eval scoring", () => {
  it("perfect", () => {
    const s = score([ob({ kind: "variation_notice" })], [{ kinds: ["variation_notice"], trigger: "event", offset_days: 7, direction: "after" }]);
    expect([s.recall, s.precision]).toEqual([1, 1]);
  });
  it("wrong period is a miss and an extra", () => {
    const s = score([ob({ kind: "variation_notice", offset_days: 5 })], [{ kinds: ["variation_notice"], trigger: "event", offset_days: 7, direction: "after" }]);
    expect([s.recall, s.precision, s.missed.length, s.extra.length]).toEqual([0, 0, 1, 1]);
  });
  it("one extraction can't satisfy two expectations", () => {
    const e = { kinds: ["other"], trigger: "event" as const, offset_days: 7, direction: "after" as const };
    expect(score([ob({})], [e, e]).recall).toBe(0.5);
  });
  it("nothing expected, nothing extracted = perfect", () => expect(score([], []).precision).toBe(1));
  it("fixtures are well-formed", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(5);
    for (const f of FIXTURES) for (const e of f.expected) expect(e.kinds.length).toBeGreaterThan(0);
  });
});
