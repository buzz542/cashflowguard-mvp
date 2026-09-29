import Stripe from "stripe";

/** True if this email has an active or trialing GuardConstruct subscription. */
export async function emailHasActivePro(email: string): Promise<boolean> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !email || !email.includes("@")) return false;

  try {
    const stripe = new Stripe(secret);
    const customers = await stripe.customers.list({
      email: email.toLowerCase().trim(),
      limit: 5
    });

    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10
      });
      for (const sub of subs.data) {
        if (sub.status === "active" || sub.status === "trialing") {
          return true;
        }
      }
    }
  } catch (e) {
    console.error("emailHasActivePro error:", e);
  }
  return false;
}

export function getStripe(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  return new Stripe(secret);
}
