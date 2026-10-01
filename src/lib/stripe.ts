import Stripe from "stripe";

let stripe: Stripe | null = null;

/**
 * Live keys only on the production deployment. Previews and local dev must use test
 * keys (sk_test_…), so testing can never charge a real card.
 */
export function stripeKeyAllowed(key: string, env: Record<string, string | undefined> = process.env): boolean {
  if (!key.startsWith("sk_live_") && !key.startsWith("rk_live_")) return true;
  return env.VERCEL_ENV === "production" || (env.NODE_ENV === "production" && !env.VERCEL_ENV && env.STRIPE_ALLOW_LIVE === "true");
}

export function getStripe(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  if (!stripeKeyAllowed(secret)) {
    console.error("Stripe: live key refused outside production. Use a test key (sk_test_...).");
    return null;
  }
  if (!stripe) stripe = new Stripe(secret);
  return stripe;
}
