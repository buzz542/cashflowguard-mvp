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
  it("7 days, 2 days, on the day, and the day after if still open", () => {
    expect(reminderSlots("2026-10-20", "2026-10-01")).toEqual([
      { sendOn: "2026-10-13", kind: "lead7" },
      { sendOn: "2026-10-18", kind: "lead2" },
      { sendOn: "2026-10-20", kind: "due" },
      { sendOn: "2026-10-21", kind: "overdue" }
    ]);
  });
  it("counts calendar days (weekends included), as the reminders are a prompt, not the contract", () => {
    expect(reminderSlots("2026-10-19", "2026-10-01")[1]).toEqual({ sendOn: "2026-10-17", kind: "lead2" });
  });
  it("drops heads-ups that have gone; if both have, one goes today", () => {
    expect(reminderSlots("2026-10-20", "2026-10-15").map((s) => s.kind)).toEqual(["lead2", "due", "overdue"]);
    expect(reminderSlots("2026-10-20", "2026-10-19")).toEqual([
      { sendOn: "2026-10-19", kind: "lead2" },
      { sendOn: "2026-10-20", kind: "due" },
      { sendOn: "2026-10-21", kind: "overdue" }
    ]);
  });
  it("due today: on the day + overdue; already past: one overdue notice today", () => {
    expect(reminderSlots("2026-10-20", "2026-10-20").map((s) => s.kind)).toEqual(["due", "overdue"]);
    expect(reminderSlots("2026-10-20", "2026-10-21")).toEqual([{ sendOn: "2026-10-21", kind: "overdue" }]);
    expect(reminderSlots("2026-10-20", "2026-11-02")).toEqual([{ sendOn: "2026-11-02", kind: "overdue" }]);
  });
  it("never schedules a kind already sent this cycle (no duplicate emails after edits)", () => {
    const sent = [{ kind: "overdue", sendOn: "2026-10-21" }];
    expect(reminderSlots("2026-10-20", "2026-10-25", sent)).toEqual([]);
    expect(reminderSlots("2026-10-20", "2026-10-19", [{ kind: "lead2", sendOn: "2026-10-18" }]).map((s) => s.kind)).toEqual(["due", "overdue"]);
  });
  it("a new cycle (next month, or a date moved well out) starts fresh", () => {
    const lastMonth = [{ kind: "lead7", sendOn: "2026-09-13" }, { kind: "due", sendOn: "2026-09-20" }];
    expect(reminderSlots("2026-10-20", "2026-09-21", lastMonth).map((s) => s.kind)).toEqual(["lead7", "lead2", "due", "overdue"]);
  });
});

describe("ukToday", () => {
  it("uses UK time, including BST", () => {
    expect(ukToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(ukToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });
});
