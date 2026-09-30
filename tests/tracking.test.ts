import { describe, it, expect } from "vitest";
import { trackingStatus } from "@/lib/trackingStatus";
import { computeDue, type ObligationTiming } from "@/lib/obligationDue";
import { unsubscribeToken, verifyUnsubscribe, unsubscribeUrl } from "@/lib/unsubscribe";

describe("trackingStatus", () => {
  const today = "2026-10-10";
  it("upcoming / due (within 7 days) / overdue / done", () => {
    expect(trackingStatus({ status: "confirmed", due_date: "2026-10-18" }, today)).toBe("upcoming");
    expect(trackingStatus({ status: "confirmed", due_date: "2026-10-17" }, today)).toBe("due");
    expect(trackingStatus({ status: "confirmed", due_date: today }, today)).toBe("due");
    expect(trackingStatus({ status: "confirmed", due_date: "2026-10-09" }, today)).toBe("overdue");
    expect(trackingStatus({ status: "done", due_date: "2026-10-01" }, today)).toBe("done");
    expect(trackingStatus({ status: "confirmed", due_date: null }, today)).toBe("upcoming");
  });
});

describe("monthly items marked done", () => {
  const monthly: ObligationTiming = {
    trigger: "monthly", fixed_date: null, day_of_month: 25, offset_days: null, direction: null,
    day_basis: "calendar", event_date: null, due_date: null, due_basis: null
  };
  it("next one is after the last one done", () => {
    expect(computeDue(monthly, "2026-10-20", new Set()).due_date).toBe("2026-10-25");
    expect(computeDue({ ...monthly, done_through: "2026-10-25" }, "2026-10-20", new Set()).due_date).toBe("2026-11-25");
  });
  it("a done_through in the past doesn't hold it back", () => {
    expect(computeDue({ ...monthly, done_through: "2026-08-25" }, "2026-10-20", new Set()).due_date).toBe("2026-10-25");
  });
  it("a repeating item starting later begins on its start date", () => {
    expect(computeDue({ ...monthly, day_of_month: 3, done_through: "2027-01-02" }, "2026-10-20", new Set()).due_date).toBe("2027-01-03");
  });
});

describe("unsubscribe links", () => {
  const key = "k".repeat(32);
  const user = "00000000-0000-0000-0000-00000000000a";
  it("round-trips and rejects tampering", () => {
    const t = unsubscribeToken(user, key);
    expect(verifyUnsubscribe(user, t, key)).toBe(true);
    expect(verifyUnsubscribe("00000000-0000-0000-0000-00000000000b", t, key)).toBe(false);
    expect(verifyUnsubscribe(user, t + "x", key)).toBe(false);
    expect(verifyUnsubscribe(user, t, "other-key")).toBe(false);
    expect(verifyUnsubscribe(user, t, "")).toBe(false);
  });
  it("no secret, no link", () => {
    expect(unsubscribeUrl("https://x", user, "")).toBeNull();
    expect(unsubscribeUrl("https://x", user, key)).toMatch(/^https:\/\/x\/api\/unsubscribe\?u=0{8}-0{4}-0{4}-0{4}-0{11}a&t=[\w-]+$/);
  });
});
