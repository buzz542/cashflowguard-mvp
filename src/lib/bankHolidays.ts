/**
 * UK bank holidays. The live gov.uk feed is authoritative (it includes one-off days
 * such as coronations); the rule-based generator below fills any years the feed
 * doesn't cover yet and is the fallback when the feed can't be reached.
 */

export const JURISDICTIONS = ["england-and-wales", "scotland", "northern-ireland"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export function isJurisdiction(v: unknown): v is Jurisdiction {
  return typeof v === "string" && (JURISDICTIONS as readonly string[]).includes(v);
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Day of week, 0 = Sunday, for a UTC calendar date. */
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** Easter Sunday (Gregorian), anonymous algorithm. Returns [month, day]. */
export function easterSunday(y: number): [number, number] {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

function shift(y: number, m: number, d: number, days: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function firstMonday(y: number, m: number): string {
  for (let d = 1; d <= 7; d++) if (dow(y, m, d) === 1) return iso(y, m, d);
  throw new Error("unreachable");
}

function lastMonday(y: number, m: number): string {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = last; d > last - 7; d--) if (dow(y, m, d) === 1) return iso(y, m, d);
  throw new Error("unreachable");
}

/**
 * Fixed-date holidays that move to the next free weekday when they fall on a weekend
 * or on another holiday (e.g. Christmas on Saturday → Monday 27th, Boxing Day → Tuesday 28th).
 */
function withSubstitutes(y: number, fixed: Array<[number, number]>, taken: Set<string>): string[] {
  const out: string[] = [];
  for (const [m, d] of fixed) {
    let offset = 0;
    for (;;) {
      const date = shift(y, m, d, offset);
      const [yy, mm, dd] = date.split("-").map(Number);
      const wd = dow(yy, mm, dd);
      if (wd !== 0 && wd !== 6 && !taken.has(date)) {
        taken.add(date);
        out.push(date);
        break;
      }
      offset++;
    }
  }
  return out;
}

/** Bank holidays for one year from the standing rules. Excludes one-off proclamations. */
export function ruleBasedHolidays(j: Jurisdiction, y: number): string[] {
  const [em, ed] = easterSunday(y);
  const goodFriday = shift(y, em, ed, -2);
  const easterMonday = shift(y, em, ed, 1);
  const taken = new Set<string>();
  const days: string[] = [];
  const add = (d: string) => {
    taken.add(d);
    days.push(d);
  };

  add(goodFriday);
  add(firstMonday(y, 5));
  add(lastMonday(y, 5));

  if (j === "scotland") {
    add(firstMonday(y, 8));
    days.push(...withSubstitutes(y, [[1, 1], [1, 2]], taken));
    days.push(...withSubstitutes(y, [[11, 30]], taken));
  } else {
    add(easterMonday);
    add(lastMonday(y, 8));
    days.push(...withSubstitutes(y, [[1, 1]], taken));
    if (j === "northern-ireland") days.push(...withSubstitutes(y, [[3, 17], [7, 12]], taken));
  }
  days.push(...withSubstitutes(y, [[12, 25], [12, 26]], taken));
  return days.sort();
}

type GovUkFeed = Record<string, { division: string; events: Array<{ date: string }> }>;

/** Combine the gov.uk feed (for years it covers) with rule-based years around `aroundYear`. */
export function mergeHolidays(j: Jurisdiction, feed: GovUkFeed | null, aroundYear: number): Set<string> {
  const set = new Set<string>();
  const covered = new Set<number>();
  for (const e of feed?.[j]?.events ?? []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      set.add(e.date);
      covered.add(Number(e.date.slice(0, 4)));
    }
  }
  for (let y = aroundYear - 1; y <= aroundYear + 3; y++) {
    if (!covered.has(y)) ruleBasedHolidays(j, y).forEach((d) => set.add(d));
  }
  return set;
}

/** Server-only: fetch the gov.uk feed (cached for a day by Next), fall back to rules. */
export async function loadHolidays(j: Jurisdiction, now = new Date()): Promise<Set<string>> {
  let feed: GovUkFeed | null = null;
  try {
    const res = await fetch("https://www.gov.uk/bank-holidays.json", {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(3_000)
    } as RequestInit);
    if (res.ok) feed = (await res.json()) as GovUkFeed;
  } catch {
    // Fall back to rules.
  }
  return mergeHolidays(j, feed, now.getUTCFullYear());
}
