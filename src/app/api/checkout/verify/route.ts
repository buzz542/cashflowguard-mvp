import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`verify:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: "Billing not configured." }, { status: 500 });
    }

    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId || !sessionId.startsWith("cs_") || sessionId.length > 200) {
      return NextResponse.json({ error: "Invalid session." }, { status: 400 });
    }

    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid =
      session.payment_status === "paid" ||
      session.status === "complete";

    return NextResponse.json({
      paid: !!paid,
      customer_email: session.customer_details?.email || session.customer_email || null
    });
  } catch (error: unknown) {
    console.error("Verify error:", error);
    return NextResponse.json({ error: "Could not verify payment." }, { status: 500 });
  }
}
