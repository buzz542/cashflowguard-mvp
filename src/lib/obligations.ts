import { z } from "zod";
import { isIsoDate, type DayBasis, type Direction } from "./deadlines";

import { OBLIGATION_KINDS, type ObligationKind } from "./obligationKinds";
export { OBLIGATION_KINDS, KIND_LABELS, type ObligationKind } from "./obligationKinds";

/**
 * Shape we ask the model for (structured outputs). The SDK only enforces types and
 * required fields server-side; enum values and numeric ranges are passed to the model
 * as guidance, so every item is re-validated in sanitizeObligations below. No .int():
 * zod's safe-integer bounds would just be noise in the schema description.
 */
const ItemSchema = z.object({
  kind: z.enum(OBLIGATION_KINDS),
  title: z.string(),
  clause_ref: z.string().nullable(),
  source_quote: z.string(),
  trigger: z.enum(["fixed_date", "monthly", "event"]),
  fixed_date: z.string().nullable(),
  day_of_month: z.number().nullable(),
  event_description: z.string().nullable(),
  offset_days: z.number().nullable(),
  direction: z.enum(["after", "before"]).nullable(),
  day_basis: z.enum(["calendar", "working", "unspecified"])
});

/**
 * What we send as the output format. Deliberately permissive (strings, not enums):
 * the SDK's parse() throws on any schema mismatch, which would lose every deadline in
 * the contract because of one odd value. Types and required fields are still enforced
 * by the API; allowed values are listed for the model and checked per item afterwards.
 */
export const ExtractionWireSchema = z.object({
  obligations: z.array(
    z.object({
      kind: z.string().describe(`One of: ${OBLIGATION_KINDS.join(", ")}`),
      title: z.string(),
      clause_ref: z.string().nullable(),
      source_quote: z.string(),
      trigger: z.string().describe("One of: fixed_date, monthly, event"),
      fixed_date: z.string().nullable().describe("YYYY-MM-DD; only when trigger is fixed_date"),
      day_of_month: z.number().nullable().describe("1-31; only when trigger is monthly"),
      event_description: z.string().nullable().describe("Only when trigger is event"),
      offset_days: z.number().nullable().describe("Whole days, 0 or more; only when trigger is event"),
      direction: z.string().nullable().describe("after or before; only when trigger is event"),
      day_basis: z.string().describe("One of: calendar, working, unspecified")
    })
  )
});

export type Obligation = {
  kind: ObligationKind;
  title: string;
  clause_ref: string | null;
  source_quote: string;
  trigger: "fixed_date" | "monthly" | "event";
  fixed_date: string | null;
  day_of_month: number | null;
  event_description: string | null;
  offset_days: number | null;
  direction: Direction | null;
  day_basis: DayBasis;
};

export const MAX_OBLIGATIONS = 25;

const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Model output is untrusted: drop anything that doesn't make a schedulable deadline,
 * normalise the rest. Never "repair" a missing period or date by guessing.
 */
export function sanitizeObligations(raw: unknown): Obligation[] {
  const list = raw && typeof raw === "object" ? (raw as { obligations?: unknown }).obligations : null;
  if (!Array.isArray(list)) return [];
  const out: Obligation[] = [];
  for (const item of list) {
    // One malformed item is dropped on its own; it doesn't take the rest down with it.
    const parsed = ItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const o = parsed.data;
    if (o.day_of_month !== null && !Number.isInteger(o.day_of_month)) continue;
    if (o.offset_days !== null && !Number.isInteger(o.offset_days)) continue;
    const title = clip(o.title, 200);
    const quote = clip(o.source_quote, 600);
    if (!title || !quote) continue;
    const base = {
      kind: o.kind,
      title,
      clause_ref: clip(o.clause_ref, 120),
      source_quote: quote,
      day_basis: o.day_basis,
      fixed_date: null,
      day_of_month: null,
      event_description: null,
      offset_days: null,
      direction: null
    } satisfies Omit<Obligation, "trigger">;

    if (o.trigger === "fixed_date") {
      if (!isIsoDate(o.fixed_date)) continue;
      out.push({ ...base, trigger: "fixed_date", fixed_date: o.fixed_date });
    } else if (o.trigger === "monthly") {
      if (o.day_of_month === null || o.day_of_month < 1 || o.day_of_month > 31) continue;
      out.push({ ...base, trigger: "monthly", day_of_month: o.day_of_month });
    } else {
      const ev = clip(o.event_description, 200);
      if (!ev || o.offset_days === null || o.offset_days < 0 || o.offset_days > 3650 || !o.direction) continue;
      out.push({ ...base, trigger: "event", event_description: ev, offset_days: o.offset_days, direction: o.direction });
    }
    if (out.length >= MAX_OBLIGATIONS) break;
  }
  return out;
}

export const EXTRACTION_SYSTEM_PROMPT = `You extract time-limited obligations from a UK construction contract for a small subcontractor or trade contractor (the user).

Include only deadlines the user must act on, or dates that decide when the user gets paid or gets retention back:
- payment applications (when the user must apply)
- payment notices and pay less notices, where the user must issue one or act by one
- variation / change / instruction notices
- extension of time, delay, early warning or claim notices
- retention release dates or triggers
- final account submission deadlines
- any other notice with a time limit that could cost the user money or rights if missed

For each obligation:
- trigger "fixed_date" ONLY if the contract states an actual calendar date (fixed_date as YYYY-MM-DD).
- trigger "monthly" if it recurs on a day of each month (day_of_month 1-31; use 31 for "last day of the month").
- trigger "event" if it is a number of days before or after something happening (offset_days, direction "after" or "before", and a short event_description such as "receipt of the instruction" or "the final date for payment"). Use offset_days 0 for "on" the event. Convert weeks to days (1 week = 7).
- day_basis "calendar" or "working" only if the contract says so (e.g. "working days", "business days", "excluding weekends"); otherwise "unspecified".
- source_quote: the exact words from the contract that set the deadline, trimmed to the relevant sentence.
- clause_ref: the clause or paragraph number if shown, else null.
- title: a short plain-English label, e.g. "Submit payment application" or "Give notice of delay".

Rules:
- Never invent a period, date or clause. If the time limit is vague ("promptly", "as soon as practicable") or missing, leave that obligation out.
- Do not include obligations that fall only on the other party unless the user has to act by that date.
- Set unused fields to null. Return an empty list if there are none.`;
