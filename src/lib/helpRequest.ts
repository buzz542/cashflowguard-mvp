import { canonicalEmail } from "./canonicalEmail";
import { escapeHtml } from "./reminderEmail";

/** Shown next to the checkbox and stored with each request, word for word. */
export const HELP_CONSENT =
  "I agree you may share this with a solicitor or adjudication partner, who may pay us a referral fee.";

export type PayLessNotice = "yes" | "no" | "unsure";

export type HelpRequestInput = {
  amountPence: number;
  debtor: string;
  daysOverdue: number;
  payLessNotice: PayLessNotice;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  notes: string | null;
  obligationId: string | null;
  reviewId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "£14,400.50", "14400", 14400.5 → pence. Null if not a positive amount up to £1bn. */
export function parseAmountPence(raw: unknown): number | null {
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.replace(/[£,\s]/g, "") : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [pounds, pence = ""] = s.split(".");
  const total = Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
  return total > 0 && total <= 100_000_000_000 ? total : null;
}

export function formatPounds(pence: number): string {
  const pounds = pence / 100;
  return "£" + pounds.toLocaleString("en-GB", { minimumFractionDigits: pence % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

function text(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

/** Validates the form body. Returns the clean input or the first problem, in plain English. */
export function parseHelpRequest(body: unknown): { ok: true; value: HelpRequestInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.consent !== true) return { ok: false, error: "Tick the box to agree before sending." };
  const amountPence = parseAmountPence(b.amount);
  if (amountPence === null) return { ok: false, error: "Enter the amount you're owed, e.g. 14400." };
  const debtor = text(b.debtor, 200);
  if (!debtor) return { ok: false, error: "Say who owes you the money." };
  const days = typeof b.daysOverdue === "number" ? b.daysOverdue : typeof b.daysOverdue === "string" ? Number(b.daysOverdue) : NaN;
  if (!Number.isInteger(days) || days < 0 || days > 3650) return { ok: false, error: "Enter how many days overdue it is." };
  if (b.payLessNotice !== "yes" && b.payLessNotice !== "no" && b.payLessNotice !== "unsure") {
    return { ok: false, error: "Say whether a pay less notice was served." };
  }
  const contactName = text(b.contactName, 120);
  if (!contactName) return { ok: false, error: "Enter your name." };
  const contactEmail = text(b.contactEmail, 254).toLowerCase();
  // Also used as the Reply-To header: no commas, quotes or angle brackets.
  if (!canonicalEmail(contactEmail) || !/^[^\s@,;<>"()]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(contactEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const phone = text(b.contactPhone, 40);
  if (phone && !/^[+()\d\s-]{6,40}$/.test(phone)) return { ok: false, error: "Enter a valid phone number, or leave it blank." };
  const notes = text(b.notes, 2000);
  const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  return {
    ok: true,
    value: {
      amountPence,
      debtor,
      daysOverdue: days,
      payLessNotice: b.payLessNotice,
      contactName,
      contactEmail,
      contactPhone: phone || null,
      notes: notes || null,
      obligationId: id(b.obligationId),
      reviewId: id(b.reviewId)
    }
  };
}

const PAY_LESS_LABEL: Record<PayLessNotice, string> = { yes: "Yes", no: "No", unsure: "Not sure" };

/** Email to the owner. Every user-entered value is escaped. */
export function renderHelpEmail(
  r: HelpRequestInput & { id: string; accountEmail: string; itemTitle: string | null },
  appUrl: string
): { subject: string; html: string; text: string } {
  const rows: Array<[string, string]> = [
    ["Amount owed", formatPounds(r.amountPence)],
    ["Owed by", r.debtor],
    ["Days overdue", String(r.daysOverdue)],
    ["Pay less notice served?", PAY_LESS_LABEL[r.payLessNotice]],
    ["Name", r.contactName],
    ["Email", r.contactEmail],
    ["Phone", r.contactPhone ?? "not given"],
    ["Account", r.accountEmail],
    ["Tracked item", r.itemTitle ?? "none (from a check result)"],
    ["Notes", r.notes ?? ""],
    ["Consent", HELP_CONSENT],
    ["Request id", r.id]
  ];
  const subject = `Help getting paid: ${formatPounds(r.amountPence)} owed by ${r.debtor}`.replace(/[\r\n]+/g, " ").slice(0, 150);
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px">
<p style="font-weight:700;margin:0 0 12px">New "Need help getting paid?" request</p>
<table style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
<p style="color:#6b7280;font-size:12px;margin-top:16px">Saved in the help_requests table. Nothing has been shared with anyone else. Reply to this email to reach the user. ${escapeHtml(appUrl)}</p>
</body></html>`;
  const textBody = `New "Need help getting paid?" request\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nSaved in the help_requests table. Nothing has been shared with anyone else.`;
  return { subject, html, text: textBody };
}
