import type { Obligation } from "./obligations";

/** What a fixture expects. `kinds` lists acceptable kinds (models reasonably differ). */
export type Expected = {
  kinds: string[];
  trigger: "fixed_date" | "monthly" | "event";
  fixed_date?: string;
  day_of_month?: number;
  offset_days?: number;
  direction?: "after" | "before";
};

export function matches(o: Obligation, e: Expected): boolean {
  if (!e.kinds.includes(o.kind) || o.trigger !== e.trigger) return false;
  if (e.trigger === "fixed_date") return o.fixed_date === e.fixed_date;
  if (e.trigger === "monthly") return o.day_of_month === e.day_of_month;
  return o.offset_days === e.offset_days && o.direction === e.direction;
}

/** Greedy one-to-one matching. Recall = expected found; precision = extracted that were expected. */
export function score(extracted: Obligation[], expected: Expected[]) {
  const used = new Set<number>();
  let hit = 0;
  const missed: Expected[] = [];
  for (const e of expected) {
    const i = extracted.findIndex((o, idx) => !used.has(idx) && matches(o, e));
    if (i >= 0) {
      used.add(i);
      hit++;
    } else missed.push(e);
  }
  const extra = extracted.filter((_, idx) => !used.has(idx));
  return {
    hit,
    expected: expected.length,
    extracted: extracted.length,
    recall: expected.length ? hit / expected.length : 1,
    precision: extracted.length ? hit / extracted.length : expected.length ? 0 : 1,
    missed,
    extra
  };
}
