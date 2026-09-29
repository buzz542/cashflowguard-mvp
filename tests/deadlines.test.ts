import { describe, it, expect } from "vitest";
import { ruleBasedHolidays } from "@/lib/bankHolidays";
import { addWorkingDays, computeEventDue, nextMonthlyDue, reminderSlots, ukToday, isIsoDate, addCalendarDays } from "@/lib/deadlines";

const ew = new Set([...ruleBasedHolidays("england-and-wales", 2026), ...ruleBasedHolidays("england-and-wales", 2027)]);

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate(20260203)).toBe(false);
  });
});

describe("working days", () => {
  it("skips weekends and bank holidays (Easter 2026)", () => {
    // Thu 2 Apr → Fri 3 (Good Friday), Sat, Sun, Mon 6 (Easter Monday) skipped → Tue 7, Wed 8
    expect(addWorkingDays("2026-04-02", 2, ew)).toBe("2026-04-08");
  });
  it("counts backwards", () => {
    expect(addWorkingDays("2026-04-08", -2, ew)).toBe("2026-04-02");
  });
  it("zero is a no-op", () => expect(addWorkingDays("2026-04-04", 0, ew)).toBe("2026-04-04"));
  it("calendar days cross month and year ends", () => {
    expect(addCalendarDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("computeEventDue", () => {
  it("calendar and working bases", () => {
    expect(computeEventDue({ eventDate: "2026-04-02", offsetDays: 2, direction: "after", dayBasis: "calendar" }, ew).dueDate).toBe("2026-04-04");
    expect(computeEventDue({ eventDate: "2026-04-02", offsetDays: 2, direction: "after", dayBasis: "working" }, ew).dueDate).toBe("2026-04-08");
  });
  it("unspecified 'within N days after' takes the earlier (calendar) date", () => {
    expect(computeEventDue({ eventDate: "2026-04-02", offsetDays: 2, direction: "after", dayBasis: "unspecified" }, ew)).toEqual({ dueDate: "2026-04-04", basisUsed: "calendar" });
  });
  it("unspecified 'N days before' takes the earlier (working) date", () => {
    // Final date for payment Fri 16 Oct 2026; pay-less notice 5 days before.
    // Calendar: Sun 11 Oct. Working: Fri 9 Oct. Earlier wins.
    expect(computeEventDue({ eventDate: "2026-10-16", offsetDays: 5, direction: "before", dayBasis: "unspecified" }, ew)).toEqual({ dueDate: "2026-10-09", basisUsed: "working" });
  });
});

describe("nextMonthlyDue", () => {
  it("this month if not passed, else next month", () => {
    expect(nextMonthlyDue(25, "2026-09-29")).toBe("2026-10-25");
    expect(nextMonthlyDue(29, "2026-09-29")).toBe("2026-09-29");
    expect(nextMonthlyDue(30, "2026-09-29")).toBe("2026-09-30");
  });
  it("clamps to month end", () => {
    expect(nextMonthlyDue(31, "2026-02-10")).toBe("2026-02-28");
    expect(nextMonthlyDue(31, "2026-04-01")).toBe("2026-04-30");
  });
  it("rolls over the year", () => expect(nextMonthlyDue(5, "2026-12-20")).toBe("2027-01-05"));
});

describe("reminderSlots", () => {
  it("heads-up two working days before, and on the day", () => {
    expect(reminderSlots("2026-10-09", "2026-09-29", ew)).toEqual([
      { sendOn: "2026-10-07", kind: "lead" },
      { sendOn: "2026-10-09", kind: "due" }
    ]);
  });
  it("lead time skips the Easter bank holidays", () => {
    // Due Tue 7 Apr 2026: two working days before is Wed 1 Apr (skips Mon 6 and Fri 3)
    expect(reminderSlots("2026-04-07", "2026-03-20", ew)[0]).toEqual({ sendOn: "2026-04-01", kind: "lead" });
  });
  it("late confirmation sends the heads-up today", () => {
    expect(reminderSlots("2026-10-09", "2026-10-08", ew)).toEqual([
      { sendOn: "2026-10-08", kind: "lead" },
      { sendOn: "2026-10-09", kind: "due" }
    ]);
  });
  it("due today: one reminder; past: none", () => {
    expect(reminderSlots("2026-10-09", "2026-10-09", ew)).toEqual([{ sendOn: "2026-10-09", kind: "due" }]);
    expect(reminderSlots("2026-10-09", "2026-10-10", ew)).toEqual([]);
  });
});

describe("ukToday", () => {
  it("uses UK time, including BST", () => {
    expect(ukToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(ukToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });
});
