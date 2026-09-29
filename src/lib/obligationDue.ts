import { computeEventDue, isIsoDate, nextMonthlyDue, type DayBasis, type Direction } from "./deadlines";

export type DueBasis = "fixed" | "monthly" | "calendar" | "working" | "manual";

export type ObligationTiming = {
  trigger: "fixed_date" | "monthly" | "event";
  fixed_date: string | null;
  day_of_month: number | null;
  offset_days: number | null;
  direction: Direction | null;
  day_basis: DayBasis;
  event_date: string | null;
  due_date: string | null;
  due_basis: DueBasis | null;
};

/**
 * Work out when an obligation is due. A date the user typed in themselves ("manual")
 * always wins. An event-triggered obligation has no date until the user logs the event.
 */
export function computeDue(
  o: ObligationTiming,
  today: string,
  holidays: Set<string>
): { due_date: string | null; due_basis: DueBasis | null } {
  if (o.due_basis === "manual" && isIsoDate(o.due_date)) return { due_date: o.due_date, due_basis: "manual" };

  if (o.trigger === "fixed_date" && isIsoDate(o.fixed_date)) return { due_date: o.fixed_date, due_basis: "fixed" };

  if (o.trigger === "monthly" && o.day_of_month) {
    return { due_date: nextMonthlyDue(o.day_of_month, today), due_basis: "monthly" };
  }

  if (o.trigger === "event" && isIsoDate(o.event_date) && o.offset_days !== null && o.direction) {
    const r = computeEventDue(
      { eventDate: o.event_date, offsetDays: o.offset_days, direction: o.direction, dayBasis: o.day_basis },
      holidays
    );
    return { due_date: r.dueDate, due_basis: r.basisUsed };
  }

  return { due_date: null, due_basis: null };
}

/** One-line explanation of how the date was reached, for the UI and emails. */
export function describeTiming(o: Pick<ObligationTiming, "trigger" | "day_of_month" | "offset_days" | "direction" | "day_basis"> & {
  event_description: string | null;
  due_basis: DueBasis | null;
}): string {
  const basisNote =
    o.day_basis === "unspecified" && (o.due_basis === "calendar" || o.due_basis === "working")
      ? " (contract doesn't say calendar or working days; we used the earlier date)"
      : "";
  if (o.due_basis === "manual") return "Date set by you";
  if (o.trigger === "fixed_date") return "Date stated in the contract";
  if (o.trigger === "monthly") return `Every month on day ${o.day_of_month}${o.day_of_month === 31 ? " (or the last day)" : ""}`;
  const days = o.offset_days === 1 ? "1 day" : `${o.offset_days} days`;
  const unit = o.day_basis === "working" ? `${days.replace("day", "working day")}` : days;
  return `${o.offset_days === 0 ? "On" : `${unit} ${o.direction}`} ${o.event_description ?? "the event"}${basisNote}`;
}
