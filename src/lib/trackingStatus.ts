import { addCalendarDays, compareDates } from "./deadlines";

export type TrackingStatus = "upcoming" | "due" | "overdue" | "done";

/** Days ahead that count as "due" (matches the first reminder). */
export const DUE_WINDOW_DAYS = 7;

/**
 * What the user sees next to a tracked item. Done: marked done. Overdue: date passed.
 * Due: today or within the next 7 days. Upcoming: later, or no date yet.
 */
export function trackingStatus(o: { status: string; due_date: string | null }, today: string): TrackingStatus {
  if (o.status === "done") return "done";
  if (!o.due_date) return "upcoming";
  if (compareDates(o.due_date, today) < 0) return "overdue";
  if (compareDates(o.due_date, addCalendarDays(today, DUE_WINDOW_DAYS)) <= 0) return "due";
  return "upcoming";
}

export const STATUS_LABELS: Record<TrackingStatus, string> = {
  upcoming: "Upcoming",
  due: "Due",
  overdue: "Overdue",
  done: "Done"
};
