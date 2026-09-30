import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { UUID_RE } from "@/lib/membership";
import { escapeHtml } from "@/lib/reminderEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · GuardConstruct</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;margin:0;padding:24px">
<main style="max-width:480px;margin:40px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
<p style="margin:0 0 8px;font-weight:700">GuardConstruct</p><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}
</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function params(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  return UUID_RE.test(u) && verifyUnsubscribe(u, t) ? { userId: u, token: t } : null;
}

const invalid = () =>
  page("Link not valid", "<p>This unsubscribe link isn't valid. You can turn reminder emails off from the account menu in the app.</p>", 400);

/** Shows a confirm button. Not a one-step GET: mail scanners open links and would unsubscribe people. */
export async function GET(req: NextRequest) {
  const p = params(req);
  if (!p) return invalid();
  const action = `/api/unsubscribe?u=${encodeURIComponent(p.userId)}&t=${encodeURIComponent(p.token)}`;
  return page(
    "Stop reminder emails?",
    `<p>You'll stop getting deadline reminder emails. Your tracked dates stay in the app.</p>
<form method="post" action="${escapeHtml(action)}"><button type="submit" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`
  );
}

/** The form above, and one-click unsubscribe from mail apps (RFC 8058). */
export async function POST(req: NextRequest) {
  const p = params(req);
  if (!p) return invalid();
  const { error } = await getSupabaseAdmin().from("profiles").update({ reminder_emails: false }).eq("id", p.userId);
  if (error) {
    console.error("unsubscribe:", error.message);
    return page("Something went wrong", "<p>Please try again, or turn reminder emails off from the account menu in the app.</p>", 500);
  }
  return page("You're unsubscribed", "<p>No more reminder emails. You can turn them back on from the account menu in the app.</p>");
}
