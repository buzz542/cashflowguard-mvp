/**
 * Deadline arithmetic for notice reminders. All dates are ISO calendar dates
 * (YYYY-MM-DD) in UK local time; no time-of-day.
 *
 * The one judgement call: when the contract doesn't say whether "days" means calendar
 * or working days ("unspecified"), we use whichever gives the EARLIER date. A reminder
 * that comes a day early costs nothing; one that comes a day late can cost a claim.
 */

export type DayBasis = "calendar" | "working" | "unspecified";
export type Direction = "after" | "before";

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function toUtc(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(t: Date): string {
  return t.toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, n: number): string {
  const t = toUtc(date);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUtc(t);
}

export function isWorkingDay(date: string, holidays: Set<string>): boolean {
  const wd = toUtc(date).getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays.has(date);
}

/** Move n working days forward (n > 0) or back (n < 0). n = 0 returns the date unchanged. */
export function addWorkingDays(date: string, n: number, holidays: Set<string>): string {
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  let d = date;
  while (left > 0) {
    d = addCalendarDays(d, step);
    if (isWorkingDay(d, holidays)) left--;
  }
  return d;
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type EventDueInput = {
  eventDate: string;
  offsetDays: number;
  direction: Direction;
  dayBasis: DayBasis;
};

export type EventDue = { dueDate: string; basisUsed: "calendar" | "working" };

export function computeEventDue(input: EventDueInput, holidays: Set<string>): EventDue {
  const sign = input.direction === "before" ? -1 : 1;
  const cal = addCalendarDays(input.eventDate, sign * input.offsetDays);
  const work = addWorkingDays(input.eventDate, sign * input.offsetDays, holidays);
  if (input.dayBasis === "calendar") return { dueDate: cal, basisUsed: "calendar" };
  if (input.dayBasis === "working") return { dueDate: work, basisUsed: "working" };
  return compareDates(cal, work) <= 0
    ? { dueDate: cal, basisUsed: "calendar" }
    : { dueDate: work, basisUsed: "working" };
}

/** The next date on or after `from` that is day `dayOfMonth`, clamped to month end (31st → 30th/28th). */
export function nextMonthlyDue(dayOfMonth: number, from: string): string {
  const f = toUtc(from);
  for (let i = 0; i < 2; i++) {
    const y = f.getUTCFullYear();
    const m = f.getUTCMonth() + i;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const candidate = fromUtc(new Date(Date.UTC(y, m, Math.min(dayOfMonth, last))));
    if (compareDates(candidate, from) >= 0) return candidate;
  }
  throw new Error("unreachable");
}

export type ReminderKind = "lead7" | "lead2" | "due" | "overdue";
export type ReminderSlot = { sendOn: string; kind: ReminderKind };

/** Calendar days from the due date for each reminder. */
export const REMINDER_OFFSETS: ReadonlyArray<{ kind: ReminderKind; days: number }> = [
  { kind: "lead7", days: -7 },
  { kind: "lead2", days: -2 },
  { kind: "due", days: 0 },
  { kind: "overdue", days: 1 }
];

/**
 * When to email about a due date: 7 days before, 2 days before, on the day, and once the
 * day after if it's still not marked done. Dates already gone are dropped; if both
 * heads-ups are gone but the date is still ahead, one heads-up goes today. If the date
 * has already passed, one overdue notice goes today.
 *
 * `alreadySent` lists reminders sent (or being sent) for this deadline: a kind already
 * sent in this cycle (on or after due - 7 days) is never scheduled again, so editing a
 * deadline can't produce a duplicate email.
 */
export function reminderSlots(
  dueDate: string,
  today: string,
  alreadySent: ReadonlyArray<{ kind: string; sendOn: string }> = []
): ReminderSlot[] {
  const cycleStart = addCalendarDays(dueDate, -7);
  const sent = new Set(alreadySent.filter((r) => compareDates(r.sendOn, cycleStart) >= 0).map((r) => r.kind));
  let slots: ReminderSlot[];
  if (compareDates(dueDate, today) < 0) {
    slots = [{ sendOn: compareDates(addCalendarDays(dueDate, 1), today) < 0 ? today : addCalendarDays(dueDate, 1), kind: "overdue" }];
  } else {
    slots = REMINDER_OFFSETS.map((o) => ({ sendOn: addCalendarDays(dueDate, o.days), kind: o.kind })).filter(
      (s) => compareDates(s.sendOn, today) >= 0
    );
    const hasLead = slots.some((s) => s.kind === "lead7" || s.kind === "lead2");
    if (!hasLead && compareDates(today, dueDate) < 0 && !sent.has("lead2") && !sent.has("lead7")) {
      slots.unshift({ sendOn: today, kind: "lead2" });
    }
  }
  return slots.filter((s) => !sent.has(s.kind));
}

/** Today's date in the UK, regardless of server timezone. */
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 9 Oct 2026". Built by hand: Intl output varies between ICU versions. */
export function formatUkDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}
