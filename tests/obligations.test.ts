import { describe, it, expect } from "vitest";
import { sanitizeObligations, MAX_OBLIGATIONS } from "@/lib/obligations";
import { computeDue, describeTiming, type ObligationTiming } from "@/lib/obligationDue";
import { ruleBasedHolidays } from "@/lib/bankHolidays";

const ew = new Set(ruleBasedHolidays("england-and-wales", 2026));

const ob = (over: Record<string, unknown>) => ({
  kind: "variation_notice",
  title: "Give notice of variation",
  clause_ref: "4.3",
  source_quote: "The Subcontractor shall give notice within 7 days of receipt of an instruction.",
  trigger: "event",
  fixed_date: null,
  day_of_month: null,
  event_description: "receipt of the instruction",
  offset_days: 7,
  direction: "after",
  day_basis: "unspecified",
  ...over
});

describe("sanitizeObligations", () => {
  it("keeps a well-formed event obligation", () => {
    const [o] = sanitizeObligations({ obligations: [ob({})] });
    expect(o).toMatchObject({ trigger: "event", offset_days: 7, direction: "after", fixed_date: null, day_of_month: null });
  });
  it("drops obligations the model couldn't date or period", () => {
    const out = sanitizeObligations({
      obligations: [
        ob({ offset_days: null }),
        ob({ direction: null }),
        ob({ event_description: "  " }),
        ob({ offset_days: -3 }),
        ob({ trigger: "fixed_date", fixed_date: "2026-02-30" }),
        ob({ trigger: "fixed_date", fixed_date: "next Tuesday" }),
        ob({ trigger: "monthly", day_of_month: 0 }),
        ob({ trigger: "monthly", day_of_month: 32 }),
        ob({ title: "" }),
        ob({ source_quote: "" })
      ]
    });
    expect(out).toEqual([]);
  });
  it("clears fields that don't belong to the trigger", () => {
    const [o] = sanitizeObligations({ obligations: [ob({ trigger: "monthly", day_of_month: 25, offset_days: 7 })] });
    expect(o).toMatchObject({ trigger: "monthly", day_of_month: 25, offset_days: null, direction: null, event_description: null });
  });
  it("rejects malformed payloads", () => {
    expect(sanitizeObligations(null)).toEqual([]);
    expect(sanitizeObligations({ obligations: "x" })).toEqual([]);
  });
  it("drops only the bad item, keeps the rest", () => {
    const out = sanitizeObligations({ obligations: [ob({ kind: "made_up" }), ob({ title: "Keep me" }), ob({ offset_days: 2.5 })] });
    expect(out.map((o) => o.title)).toEqual(["Keep me"]);
  });
  it("caps count and collapses whitespace", () => {
    const many = Array.from({ length: 40 }, () => ob({ title: "  Give   notice  " }));
    const out = sanitizeObligations({ obligations: many });
    expect(out).toHaveLength(MAX_OBLIGATIONS);
    expect(out[0].title).toBe("Give notice");
  });
});

const timing = (over: Partial<ObligationTiming>): ObligationTiming => ({
  trigger: "event", fixed_date: null, day_of_month: null, offset_days: 7, direction: "after",
  day_basis: "unspecified", event_date: null, due_date: null, due_basis: null, ...over
});

describe("computeDue", () => {
  it("event without a logged date has no due date", () => {
    expect(computeDue(timing({}), "2026-09-29", ew)).toEqual({ due_date: null, due_basis: null });
  });
  it("event with a date uses the conservative rule", () => {
    // 7 calendar days after Thu 2 Apr 2026 = Thu 9 Apr; 7 working days = Wed 15 Apr. Earlier wins.
    expect(computeDue(timing({ event_date: "2026-04-02" }), "2026-04-02", ew)).toEqual({ due_date: "2026-04-09", due_basis: "calendar" });
  });
  it("fixed and monthly", () => {
    expect(computeDue(timing({ trigger: "fixed_date", fixed_date: "2026-11-30" }), "2026-09-29", ew)).toEqual({ due_date: "2026-11-30", due_basis: "fixed" });
    expect(computeDue(timing({ trigger: "monthly", day_of_month: 25 }), "2026-09-29", ew)).toEqual({ due_date: "2026-10-25", due_basis: "monthly" });
  });
  it("a date the user set wins", () => {
    expect(computeDue(timing({ event_date: "2026-04-02", due_date: "2026-04-20", due_basis: "manual" }), "2026-04-02", ew)).toEqual({ due_date: "2026-04-20", due_basis: "manual" });
  });
});

describe("describeTiming", () => {
  it("explains the conservative choice", () => {
    expect(describeTiming({ ...timing({}), event_description: "receipt of the instruction", due_basis: "calendar" }))
      .toBe("7 days after receipt of the instruction (contract doesn't say calendar or working days; we used the earlier date)");
  });
  it("working days and same-day", () => {
    expect(describeTiming({ ...timing({ day_basis: "working", offset_days: 5, direction: "before" }), event_description: "the final date for payment", due_basis: "working" }))
      .toBe("5 working days before the final date for payment");
    expect(describeTiming({ ...timing({ offset_days: 0 }), event_description: "practical completion", due_basis: null })).toBe("On practical completion");
  });
});
