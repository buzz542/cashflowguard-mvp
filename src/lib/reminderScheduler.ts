import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { loadHolidays, isJurisdiction, type Jurisdiction } from "./bankHolidays";
import { reminderSlots, ukToday } from "./deadlines";
import { computeDue, type ObligationTiming } from "./obligationDue";

/** Whether this user may confirm deadlines and get reminders. Pro-only by default (REMINDERS_PRO_ONLY). */
export function remindersAllowed(isPro: boolean): boolean {
  return !config.remindersProOnly || isPro;
}

export const OBLIGATION_COLUMNS =
  "id, workspace_id, review_id, job_id, kind, title, clause_ref, source_quote, trigger, fixed_date, day_of_month, " +
  "event_description, offset_days, direction, day_basis, status, event_date, due_date, due_basis, created_at";

type Row = ObligationTiming & {
  id: string;
  status: "suggested" | "confirmed" | "dismissed";
  job_id: string | null;
};

/**
 * Recompute an obligation's due date and replace its pending reminders.
 * Call after any change to status, event date, manual date, job or assignee.
 */
export async function rescheduleObligation(admin: SupabaseClient, obligationId: string, today = ukToday()) {
  const { data: o, error } = await admin.from("obligations").select(OBLIGATION_COLUMNS).eq("id", obligationId).single();
  if (error || !o) throw new Error(`rescheduleObligation: ${error?.message ?? "not found"}`);
  const row = o as unknown as Row;

  let jurisdiction: Jurisdiction = "england-and-wales";
  let recipient: string | null = null;
  if (row.job_id) {
    const { data: job } = await admin.from("jobs").select("jurisdiction, created_by").eq("id", row.job_id).single();
    if (job && isJurisdiction(job.jurisdiction)) jurisdiction = job.jurisdiction;
    recipient = (job?.created_by as string | null) ?? null;
  }

  const holidays = await loadHolidays(jurisdiction);
  const due = computeDue(row, today, holidays);

  const { data: updated, error: upErr } = await admin
    .from("obligations")
    .update({ due_date: due.due_date, due_basis: due.due_basis, updated_at: new Date().toISOString() })
    .eq("id", obligationId)
    .select(OBLIGATION_COLUMNS)
    .single();
  if (upErr) throw new Error(`rescheduleObligation update: ${upErr.message}`);

  await admin.from("reminders").delete().eq("obligation_id", obligationId).eq("status", "pending");

  if (row.status === "confirmed" && due.due_date && recipient) {
    const slots = reminderSlots(due.due_date, today, holidays);
    if (slots.length) {
      const { error: insErr } = await admin.from("reminders").upsert(
        slots.map((s) => ({ obligation_id: obligationId, user_id: recipient, send_on: s.sendOn, kind: s.kind })),
        { onConflict: "obligation_id,user_id,send_on,kind", ignoreDuplicates: true }
      );
      if (insErr) throw new Error(`rescheduleObligation reminders: ${insErr.message}`);
    }
  }
  return updated;
}
