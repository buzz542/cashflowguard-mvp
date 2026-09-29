import { describe, it, expect } from "vitest";
import { easterSunday, ruleBasedHolidays, mergeHolidays, isJurisdiction } from "@/lib/bankHolidays";

describe("easterSunday", () => {
  it.each([
    [2019, [4, 21]], [2024, [3, 31]], [2025, [4, 20]], [2026, [4, 5]], [2027, [3, 28]], [2028, [4, 16]], [2030, [4, 21]]
  ])("%i", (y, md) => expect(easterSunday(y)).toEqual(md));
});

// Published gov.uk dates for years with no one-off proclamations.
describe("ruleBasedHolidays matches published dates", () => {
  it("England and Wales", () => {
    expect(ruleBasedHolidays("england-and-wales", 2021)).toEqual(["2021-01-01", "2021-04-02", "2021-04-05", "2021-05-03", "2021-05-31", "2021-08-30", "2021-12-27", "2021-12-28"]);
    expect(ruleBasedHolidays("england-and-wales", 2024)).toEqual(["2024-01-01", "2024-03-29", "2024-04-01", "2024-05-06", "2024-05-27", "2024-08-26", "2024-12-25", "2024-12-26"]);
    expect(ruleBasedHolidays("england-and-wales", 2025)).toEqual(["2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26"]);
    expect(ruleBasedHolidays("england-and-wales", 2026)).toEqual(["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28"]);
  });
  it("Scotland (2 Jan, first Monday of August, St Andrew's Day, no Easter Monday)", () => {
    expect(ruleBasedHolidays("scotland", 2025)).toEqual(["2025-01-01", "2025-01-02", "2025-04-18", "2025-05-05", "2025-05-26", "2025-08-04", "2025-12-01", "2025-12-25", "2025-12-26"]);
  });
  it("Scotland substitutes both New Year days when they fall on a weekend", () => {
    const d = ruleBasedHolidays("scotland", 2022);
    expect(d).toContain("2022-01-03");
    expect(d).toContain("2022-01-04");
  });
  it("Northern Ireland adds St Patrick's Day and the Twelfth, with substitutes", () => {
    const d = ruleBasedHolidays("northern-ireland", 2025);
    expect(d).toContain("2025-03-17");
    expect(d).toContain("2025-07-14"); // 12 July 2025 is a Saturday
    expect(d).toContain("2025-04-21"); // Easter Monday
  });
});

describe("mergeHolidays", () => {
  it("prefers the feed for covered years (incl. one-offs) and uses rules for the rest", () => {
    const feed = { "england-and-wales": { division: "england-and-wales", events: [{ date: "2026-06-15" }, { date: "2026-01-01" }] } };
    const s = mergeHolidays("england-and-wales", feed, 2026);
    expect(s.has("2026-06-15")).toBe(true);   // one-off from feed
    expect(s.has("2026-04-03")).toBe(false);  // 2026 is covered by the feed, rules not added
    expect(s.has("2027-03-26")).toBe(true);   // 2027 from rules
  });
  it("falls back to rules when the feed is unavailable", () => {
    expect(mergeHolidays("scotland", null, 2026).has("2026-11-30")).toBe(true);
  });
  it("validates jurisdiction", () => {
    expect(isJurisdiction("scotland")).toBe(true);
    expect(isJurisdiction("wales")).toBe(false);
  });
});
