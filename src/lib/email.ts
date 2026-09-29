/**
 * Transactional email via Resend's HTTP API. Needs RESEND_API_KEY and EMAIL_FROM
 * (a sender on a domain verified in Resend, e.g. "GuardConstruct <reminders@guardconstruct.com>").
 */
export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`email send failed: ${res.status} ${body.slice(0, 200)}`);
  }
}
