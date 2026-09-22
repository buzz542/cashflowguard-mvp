import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Missing email or code" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL || "GuardConstruct <onboarding@resend.dev>";

    // If Resend is not configured, return so the client can fall back to on-screen code (dev)
    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        mode: "dev",
        message: "RESEND_API_KEY not set — show code on screen"
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your GuardConstruct verification code",
        text: `Your GuardConstruct verification code is: ${code}\n\nIt expires when you close this window. If you did not request this, ignore this email.\n\n— GuardConstruct",
        html: `<p>Your GuardConstruct verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p style="color:#666;font-size:13px;">If you did not request this, ignore this email.</p>`
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return NextResponse.json({ error: "Could not send email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: "email" });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Send failed" }, { status: 500 });
  }
}
