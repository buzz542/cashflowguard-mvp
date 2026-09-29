/**
 * Server-side settings. Product decisions that were still open when this was built
 * (see docs/PRD.md, Open questions) live here as env-overridable defaults so changing
 * them is a config change, not a code change.
 */

type Env = Record<string, string | undefined>;

export function readInt(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

export function readBool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return fallback;
}

export function loadConfig(env: Env = process.env) {
  return {
    /** Free checks per person (per canonical email), lifetime. UI copy says "one". */
    freeReviewLimit: readInt(env, "FREE_REVIEW_LIMIT", 1, 0, 100),
    /** Free checks from one IP address in any 24h window, across all accounts. */
    freeReviewsPerIpPerDay: readInt(env, "FREE_REVIEWS_PER_IP_PER_DAY", 3, 0, 1000),
    /** Circuit breaker: total free checks per UTC day across the whole service. */
    freeReviewsGlobalPerDay: readInt(env, "FREE_REVIEWS_GLOBAL_PER_DAY", 200, 0, 100000),
    /** Reviews per user per hour, Pro included. A speed bump, not a plan limit. */
    reviewsPerUserPerHour: readInt(env, "REVIEWS_PER_USER_PER_HOUR", 20, 1, 1000),
    /** Model for review + OCR. Kept at the model the app shipped with until you choose otherwise. */
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5"
  };
}

export const config = loadConfig();

/** Bump when the Terms or Privacy Policy change materially; users must re-accept. */
export const TERMS_VERSION = "2026-09-29.1";

/** Bump when the review system prompt changes, so stored reviews record which one produced them. */
export const PROMPT_VERSION = "2026-09-29.1";

export function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const origin = req.headers.get("origin");
  if (origin) return origin;
  return new URL(req.url).origin;
}
