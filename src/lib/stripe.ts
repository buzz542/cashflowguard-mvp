import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  if (!stripe) stripe = new Stripe(secret);
  return stripe;
}
