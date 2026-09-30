import { describe, it, expect } from "vitest";
import { parseHelpRequest, parseAmountPence, formatPounds, renderHelpEmail, HELP_CONSENT } from "@/lib/helpRequest";

const good = {
  amount: "£14,400",
  debtor: "Northgate Build Ltd",
  daysOverdue: 21,
  payLessNotice: "no",
  contactName: "Sam",
  contactEmail: "Sam@Example.com",
  contactPhone: "07700 900123",
  consent: true
};

describe("parseHelpRequest", () => {
  it("accepts a complete form", () => {
    const r = parseHelpRequest(good);
    expect(r.ok && r.value).toMatchObject({ amountPence: 1440000, debtor: "Northgate Build Ltd", daysOverdue: 21, contactEmail: "sam@example.com", obligationId: null });
  });
  it("requires the consent tick, exactly true", () => {
    expect(parseHelpRequest({ ...good, consent: false })).toEqual({ ok: false, error: "Tick the box to agree before sending." });
    expect(parseHelpRequest({ ...good, consent: "true" }).ok).toBe(false);
  });
  it("rejects bad fields with a plain message", () => {
    expect(parseHelpRequest({ ...good, amount: "0" }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, debtor: "  " }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, daysOverdue: -1 }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, payLessNotice: "maybe" }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, contactEmail: "a@@b.com" }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, contactEmail: "a,b@example.com" }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, contactEmail: "<x>@example.com" }).ok).toBe(false);
    expect(parseHelpRequest({ ...good, contactPhone: "call me" }).ok).toBe(false);
    expect(parseHelpRequest(null).ok).toBe(false);
  });
  it("drops ids that aren't UUIDs", () => {
    const r = parseHelpRequest({ ...good, obligationId: "../x", reviewId: "00000000-0000-0000-0000-000000000001" });
    expect(r.ok && r.value.obligationId).toBeNull();
    expect(r.ok && r.value.reviewId).toBe("00000000-0000-0000-0000-000000000001");
  });
});

describe("amounts", () => {
  it("parses pounds and pence", () => {
    expect(parseAmountPence("14400.5")).toBe(1440050);
    expect(parseAmountPence(99.99)).toBe(9999);
    expect(parseAmountPence("1.234")).toBeNull();
    expect(parseAmountPence("-5")).toBeNull();
    expect(formatPounds(1440000)).toBe("£14,400");
    expect(formatPounds(1440050)).toBe("£14,400.50");
  });
});

describe("owner email", () => {
  it("escapes user input and includes the consent wording", () => {
    const r = parseHelpRequest({ ...good, debtor: "<script>x</script> Ltd", notes: "Paid <b>nothing</b>" });
    if (!r.ok) throw new Error(r.error);
    const m = renderHelpEmail({ ...r.value, id: "req1", accountEmail: "sam@example.com", itemTitle: "Valuation 2" }, "https://x");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain(HELP_CONSENT);
    expect(m.subject).toBe("Help getting paid: £14,400 owed by <script>x</script> Ltd");
  });
});
