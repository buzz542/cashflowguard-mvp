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

export const DEFAULT_MODEL = "claude-sonnet-5-5";

function readEffort(raw: string | undefined): "low" | "medium" | "high" {
  const v = raw?.trim().toLowerCase();
  return v === "low" || v === "medium" ? v : "high";
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
    /** Model for review, photo reading and deadline extraction. */
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    /** Model for deadline extraction. Defaults to the review model. */
    extractionModel: env.ANTHROPIC_EXTRACTION_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    /** Sonnet 5.5 only. "off" = no extended thinking (fastest, how the app ran on Sonnet 4.5); "adaptive" = let it think. */
    anthropicThinking: (env.ANTHROPIC_THINKING?.trim().toLowerCase() === "adaptive" ? "adaptive" : "off") as "off" | "adaptive",
    /** Sonnet 5.5 only. low | medium | high. "off" thinking allows high at most. */
    anthropicEffort: readEffort(env.ANTHROPIC_EFFORT),
    /** Deadline extraction + reminders only for Pro. Set false to offer them on the free check too. */
    remindersProOnly: readBool(env, "REMINDERS_PRO_ONLY", true),
    /** Most members (and seats) a team workspace can have. Product targets firms under 25 staff. */
    maxTeamSeats: readInt(env, "MAX_TEAM_SEATS", 25, 2, 500),
    /** Team workspaces one person can own. */
    maxOwnedTeams: readInt(env, "MAX_OWNED_TEAMS", 3, 1, 50),
    inviteTtlDays: readInt(env, "INVITE_TTL_DAYS", 7, 1, 90),
    /** Photo pages a non-Pro user can have read per UK day (each is an AI call). */
    freeOcrPagesPerDay: readInt(env, "FREE_OCR_PAGES_PER_DAY", 12, 0, 500),
    /** Service-wide daily cap on photo pages for non-Pro users. */
    freeOcrPagesGlobalPerDay: readInt(env, "FREE_OCR_PAGES_GLOBAL_PER_DAY", 2000, 0, 1000000)
  };
}

export const config = loadConfig();

/** Bump when the Terms or Privacy Policy change materially; users must re-accept. */
export const TERMS_VERSION = "2026-09-29.3";

/** Bump when the review system prompt changes, so stored reviews record which one produced them. */
export const PROMPT_VERSION = "2026-09-30.1";

/** Bump when the deadline-extraction prompt or schema changes. */
export const EXTRACTION_VERSION = "2026-09-29.1";

/**
 * Where to send people back to (Stripe, emails). Never a per-deployment *.vercel.app URL
 * in production: those sit behind Vercel's login wall.
 */
export function resolveAppOrigin(env: Env, requestOrigin: string | null, requestUrl: string): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const prodDomain = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (env.VERCEL_ENV === "production" && prodDomain) return `https://${prodDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  if (requestOrigin) return requestOrigin;
  return new URL(requestUrl).origin;
}

export function appOrigin(req: Request): string {
  return resolveAppOrigin(process.env, req.headers.get("origin"), req.url);
}
