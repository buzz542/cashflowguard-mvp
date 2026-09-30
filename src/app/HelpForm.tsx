"use client";

import { useState } from "react";
import type { ApiError, ObligationRow } from "@/lib/clientTypes";
import { HELP_CONSENT } from "@/lib/helpRequest";
import { ukToday, compareDates } from "@/lib/deadlines";

export type HelpContext = { obligation?: ObligationRow | null; reviewId?: string | null };

function daysSince(due: string | null | undefined): string {
  if (!due) return "";
  const today = ukToday();
  if (compareDates(due, today) >= 0) return "0";
  return String(Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86_400_000));
}

/** "Need help getting paid?" Saved and emailed to GuardConstruct only; nothing is sent on automatically. */
export function HelpForm({
  context,
  defaultName,
  defaultEmail,
  onClose
}: {
  context: HelpContext;
  defaultName: string;
  defaultEmail: string;
  onClose: () => void;
}) {
  const o = context.obligation ?? null;
  const [amount, setAmount] = useState("");
  const [debtor, setDebtor] = useState("");
  const [daysOverdue, setDaysOverdue] = useState(daysSince(o?.due_date));
  const [payLessNotice, setPayLessNotice] = useState<"" | "yes" | "no" | "unsure">("");
  const [contactName, setContactName] = useState(defaultName);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          debtor,
          daysOverdue: daysOverdue === "" ? null : Number(daysOverdue),
          payLessNotice,
          contactName,
          contactEmail,
          contactPhone,
          notes,
          consent,
          obligationId: o?.id ?? null,
          reviewId: context.reviewId ?? o?.review_id ?? null
        })
      });
      const data = (await res.json().catch(() => ({}))) as ApiError;
      if (!res.ok) throw new Error(data.error || "Could not send");
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="bg-white rounded-2xl border p-5 w-full max-w-md space-y-3 my-8">
        <div className="flex justify-between items-start gap-2">
          <h2 id="help-title" className="text-lg font-bold">Need help getting paid?</h2>
          <button type="button" className="text-sm text-gray-500" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {sent ? (
          <>
            <p className="text-sm text-gray-700">
              Thanks. We&apos;ve got your details and will be in touch by email. We haven&apos;t passed them to anyone yet.
            </p>
            <button type="button" className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm" onClick={onClose}>Close</button>
          </>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <p className="text-sm text-gray-600">
              Tell us what you&apos;re owed. We can put you in touch with a solicitor or adjudication service. This isn&apos;t legal advice.
            </p>
            {o && <p className="text-xs text-gray-500">About: {o.title}</p>}
            <label className="block text-sm">Amount owed (£)
              <input className={field} inputMode="decimal" placeholder="e.g. 14,400" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <label className="block text-sm">Who owes it
              <input className={field} placeholder="Company name" maxLength={200} value={debtor} onChange={(e) => setDebtor(e.target.value)} required />
            </label>
            <label className="block text-sm">Days overdue
              <input className={field} type="number" min={0} max={3650} value={daysOverdue} onChange={(e) => setDaysOverdue(e.target.value)} required />
            </label>
            <fieldset className="text-sm">
              <legend>Did they serve a pay less notice?</legend>
              <div className="flex gap-4 mt-1">
                {(["yes", "no", "unsure"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1">
                    <input type="radio" name="payless" value={v} checked={payLessNotice === v} onChange={() => setPayLessNotice(v)} required />
                    {v === "yes" ? "Yes" : v === "no" ? "No" : "Not sure"}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">Your name
              <input className={field} maxLength={120} value={contactName} onChange={(e) => setContactName(e.target.value)} required />
            </label>
            <label className="block text-sm">Email
              <input className={field} type="email" maxLength={254} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
            </label>
            <label className="block text-sm">Phone (optional)
              <input className={field} type="tel" maxLength={40} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </label>
            <label className="block text-sm">Anything else (optional)
              <textarea className={field} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>{HELP_CONSENT}</span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || !consent} className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
