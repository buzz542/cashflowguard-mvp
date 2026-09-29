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
  "event_description, offset_days, direction, day_basis, status, event_date, due_date, due_basis, assignee_id, created_at";

type Row = ObligationTiming & {
  id: string;
  status: "suggested" | "confirmed" | "dismissed";
  workspace_id: string;
  job_id: string | null;
  assignee_id: string | null;
};

/**
 * Who gets the reminder: the assignee, else whoever started tracking the job, else the
 * workspace owner. People who have left the workspace are skipped.
 */
export function pickRecipient(candidates: Array<string | null | undefined>, members: Set<string>): string | null {
  for (const c of candidates) if (c && members.has(c)) return c;
  return null;
}

/**
 * Recompute an obligation's due date and replace its pending reminders.
 * Call after any change to status, event date, manual date, job or assignee.
 */
export async function rescheduleObligation(admin: SupabaseClient, obligationId: string, today = ukToday()) {
  const { data: o, error } = await admin.from("obligations").select(OBLIGATION_COLUMNS).eq("id", obligationId).single();
  if (error || !o) throw new Error(`rescheduleObligation: ${error?.message ?? "not found"}`);
  const row = o as unknown as Row;

  let jurisdiction: Jurisdiction = "england-and-wales";
  let jobCreator: string | null = null;
  if (row.job_id) {
    const { data: job } = await admin.from("jobs").select("jurisdiction, created_by").eq("id", row.job_id).single();
    if (job && isJurisdiction(job.jurisdiction)) jurisdiction = job.jurisdiction;
    jobCreator = (job?.created_by as string | null) ?? null;
  }
  const [{ data: ws }, { data: memberRows }] = await Promise.all([
    admin.from("workspaces").select("owner_id").eq("id", row.workspace_id).single(),
    admin.from("workspace_members").select("user_id").eq("workspace_id", row.workspace_id)
  ]);
  const members = new Set((memberRows ?? []).map((m) => m.user_id as string));
  const recipient = pickRecipient([row.assignee_id, jobCreator, ws?.owner_id as string | undefined], members);

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

/**
 * After someone leaves or is removed from a workspace: unassign their deadlines and
 * re-route every reminder that was going to them.
 */
export async function reassignAfterMemberLeft(admin: SupabaseClient, workspaceId: string, userId: string) {
  const { data: assigned } = await admin
    .from("obligations")
    .update({ assignee_id: null })
    .eq("workspace_id", workspaceId)
    .eq("assignee_id", userId)
    .select("id");
  const { data: pending } = await admin
    .from("reminders")
    .select("obligation_id, obligations!inner(workspace_id)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("obligations.workspace_id", workspaceId);
  const ids = new Set<string>([
    ...(assigned ?? []).map((o) => o.id as string),
    ...(pending ?? []).map((r) => r.obligation_id as string)
  ]);
  for (const id of Array.from(ids)) await rescheduleObligation(admin, id);
}
