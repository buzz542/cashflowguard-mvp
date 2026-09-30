import { kindLabel } from "./obligationKinds";
import { formatUkDate } from "./deadlines";
export { formatUkDate } from "./deadlines";

export type DigestItem = {
  title: string;
  kind: string;
  clauseRef: string | null;
  dueDate: string;
  dueBasis: string | null;
  jobName: string | null;
  reminderKind: "lead" | "lead7" | "lead2" | "due" | "overdue";
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * One email per person per day listing everything due. Every model-derived string is
 * escaped: titles and clause refs come from contract text.
 */
export const REMINDER_NOTICE = "Reminders are a prompt only. Check your contract for exact dates.";

/** Most urgent first: overdue, due today, then heads-ups. */
const URGENCY: Record<DigestItem["reminderKind"], number> = { overdue: 0, due: 1, lead2: 2, lead: 2, lead7: 3 };

/** Two reminders for the same item on the same day: keep the more urgent kind. */
export function moreUrgent(a: DigestItem["reminderKind"] | undefined, b: DigestItem["reminderKind"]): DigestItem["reminderKind"] {
  return a !== undefined && URGENCY[a] <= URGENCY[b] ? a : b;
}

export function renderDigest(
  items: DigestItem[],
  appUrl: string,
  unsubscribeUrl: string | null = null
): { subject: string; html: string; text: string } {
  const sorted = [...items].sort(
    (a, b) => URGENCY[a.reminderKind] - URGENCY[b.reminderKind] || (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)
  );
  const top = sorted[0]?.reminderKind;
  const headline = top === "overdue" ? "Overdue" : top === "due" ? "Due today" : "Coming up";
  const subject =
    sorted.length === 1
      ? `${headline}: ${sorted[0].title}`.slice(0, 120)
      : `${sorted.length} contract dates: ${top === "overdue" ? "overdue or due" : top === "due" ? "due now" : "coming up"}`;

  const note = (b: string | null) =>
    b === "calendar" || b === "working" ? ` Counted in ${b} days.` : b === "monthly" ? " Monthly." : "";

  const rows = sorted.map((i) => {
    const when =
      i.reminderKind === "overdue"
        ? `Overdue: was due ${formatUkDate(i.dueDate)}`
        : `${i.reminderKind === "due" ? "Due today" : "Due"} ${formatUkDate(i.dueDate)}`;
    const meta = [kindLabel(i.kind), i.clauseRef ? `Clause ${i.clauseRef}` : null, i.jobName].filter(Boolean).join(" · ");
    return {
      html: `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
<p style="margin:0;font-weight:600;color:#111827">${escapeHtml(i.title)}</p>
<p style="margin:4px 0 0;color:#b91c1c;font-size:14px">${escapeHtml(when)}.${escapeHtml(note(i.dueBasis))}</p>
<p style="margin:4px 0 0;color:#6b7280;font-size:13px">${escapeHtml(meta)}</p></td></tr>`,
      text: `- ${i.title}\n  ${when}.${note(i.dueBasis)}\n  ${meta}`
    };
  });

  const disclaimer = `${REMINDER_NOTICE} Dates found by the contract check are picked out by AI and may be wrong or incomplete. Not legal advice.`;
  const safeUrl = escapeHtml(appUrl);
  const optOut = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe from reminder emails</a>`
    : "Turn reminder emails off from the account menu in the app.";
  const optOutText = unsubscribeUrl ? `Unsubscribe from reminder emails: ${unsubscribeUrl}` : "Turn reminder emails off from the account menu in the app.";
  const overdueNote = sorted.some((i) => i.reminderKind === "overdue")
    ? `<tr><td style="padding-top:12px;color:#374151;font-size:14px">Waiting on payment? Open the item in the app and use <b>Need help getting paid?</b></td></tr>`
    : "";

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafaf9;padding:24px">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
<tr><td><p style="margin:0 0 4px;font-weight:700;font-size:18px">GuardConstruct</p>
<p style="margin:0 0 12px;color:#374151">Dates you asked us to track:</p></td></tr>
${rows.map((r) => r.html).join("\n")}
${overdueNote}
<tr><td style="padding-top:16px"><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Open GuardConstruct</a></td></tr>
<tr><td style="padding-top:16px;color:#6b7280;font-size:12px">${escapeHtml(disclaimer)}<br><br>${optOut}</td></tr>
</table></body></html>`;

  const text = `GuardConstruct: contract deadlines you asked us to track\n\n${rows.map((r) => r.text).join("\n\n")}\n\nOpen GuardConstruct: ${appUrl}\n\n${disclaimer}\n${optOutText}`;

  return { subject, html, text };
}
