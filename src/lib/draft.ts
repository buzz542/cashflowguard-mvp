/**
 * The check in progress, kept in sessionStorage so a refresh or accidental back doesn't
 * lose it. sessionStorage is per tab and cleared when the tab closes.
 */

export const DRAFT_KEY = "gc_draft";

export type Draft =
  | {
      step: "context" | "upload";
      context: { trade: string; projectSize: string; duration: string; role: string };
      contractText: string;
      pages: string[];
    }
  | { step: "loading" }
  | { step: "results"; reviewId: string };

const MAX_TEXT = 120_000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Parse and validate a stored draft. Anything odd → null (start fresh). */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (o.step === "loading") return { step: "loading" };
  if (o.step === "results") {
    return typeof o.reviewId === "string" && /^[0-9a-f-]{36}$/i.test(o.reviewId) ? { step: "results", reviewId: o.reviewId } : null;
  }
  if (o.step === "context" || o.step === "upload") {
    const c = (o.context && typeof o.context === "object" ? o.context : {}) as Record<string, unknown>;
    return {
      step: o.step,
      context: { trade: str(c.trade, 120), projectSize: str(c.projectSize, 80), duration: str(c.duration, 80), role: str(c.role, 80) },
      contractText: str(o.contractText, MAX_TEXT),
      pages: Array.isArray(o.pages) ? o.pages.filter((p): p is string => typeof p === "string").slice(0, 100) : []
    };
  }
  return null;
}
