/**
 * Validates reviews a user uploads from their browser's old localStorage history so
 * they can be moved into their account. Anything malformed is dropped, not repaired.
 */

export type ImportedReview = {
  createdAt: string;
  trade: string | null;
  role: string | null;
  result: string;
};

export const MAX_IMPORT = 30;
const MAX_RESULT_CHARS = 200_000;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function sanitizeImport(payload: unknown, now = Date.now()): ImportedReview[] {
  if (!Array.isArray(payload)) return [];
  const out: ImportedReview[] = [];
  for (const item of payload.slice(0, MAX_IMPORT)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const result = typeof r.result === "string" ? r.result.trim() : "";
    if (!result || result.length > MAX_RESULT_CHARS) continue;

    const t = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
    // Local history started in 2026; reject nonsense or future timestamps.
    const createdAt = Number.isFinite(t) && t > Date.UTC(2024, 0, 1) && t <= now ? new Date(t).toISOString() : new Date(now).toISOString();

    out.push({
      createdAt,
      trade: str(r.trade, 120),
      role: str(r.role, 80),
      result
    });
  }
  return out;
}
