import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isUserProInWorkspace } from "@/lib/session";
import { config, appOrigin } from "@/lib/config";
import { ukToday } from "@/lib/deadlines";
import { rescheduleObligation } from "@/lib/reminderScheduler";
import { renderDigest, moreUrgent, type DigestItem } from "@/lib/reminderEmail";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { emailConfigured, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 500;

type Claimed = {
  reminder_id: string;
  user_id: string;
  email: string;
  reminder_kind: DigestItem["reminderKind"];
  obligation_id: string;
  obligation_kind: string;
  title: string;
  clause_ref: string | null;
  due_date: string;
  due_basis: string | null;
  job_id: string | null;
  job_name: string | null;
  workspace_id: string;
};

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Daily (vercel.json). Claims due reminders, sends one digest email per person, then rolls
 * monthly items forward. Safe to re-run: claimed rows can't be claimed twice.
 */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailConfigured()) {
    console.error("cron/reminders: email not configured; nothing claimed");
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const admin = getSupabaseAdmin();
  const today = ukToday();
  const summary = { rolled: 0, claimed: 0, sent: 0, skipped: 0, failed: 0 };

  // 0. Privacy policy: invite emails are kept only until accepted, revoked or expired.
  const { error: invErr } = await admin
    .from("workspace_invites")
    .delete()
    .or(`accepted_at.not.is.null,expires_at.lt.${new Date().toISOString()}`);
  if (invErr) console.error("invite cleanup:", invErr.message);

  // 2. Claim.
  const { data, error } = await admin.rpc("claim_due_reminders", { p_today: today, p_limit: BATCH });
  if (error) {
    console.error("claim_due_reminders:", error.message);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }
  const claimed = (data ?? []) as Claimed[];
  summary.claimed = claimed.length;

  // 3. Drop anything the user is no longer entitled to (e.g. Pro lapsed).
  const entitled = new Map<string, boolean>();
  const keep: Claimed[] = [];
  const skipIds: string[] = [];
  for (const c of claimed) {
    const key = `${c.workspace_id}:${c.user_id}`;
    if (!entitled.has(key)) {
      entitled.set(key, !config.remindersProOnly || (await isUserProInWorkspace(c.workspace_id, c.user_id)));
    }
    if (entitled.get(key)) keep.push(c);
    else skipIds.push(c.reminder_id);
  }
  if (skipIds.length) {
    await admin.from("reminders").update({ status: "skipped" }).in("id", skipIds);
    summary.skipped = skipIds.length;
  }

  // 4. One email per person, one line per obligation.
  const byUser = new Map<string, Claimed[]>();
  for (const c of keep) byUser.set(c.user_id, [...(byUser.get(c.user_id) ?? []), c]);

  const appUrl = appOrigin(req);
  for (const rows of Array.from(byUser.values())) {
    const perObligation = new Map<string, DigestItem>();
    for (const r of rows) {
      const prev = perObligation.get(r.obligation_id);
      perObligation.set(r.obligation_id, {
        title: r.title,
        kind: r.obligation_kind,
        clauseRef: r.clause_ref,
        dueDate: r.due_date,
        dueBasis: r.due_basis,
        jobName: r.job_name,
        reminderKind: moreUrgent(prev?.reminderKind, r.reminder_kind)
      });
    }
    const ids = rows.map((r) => r.reminder_id);
    try {
      const unsub = unsubscribeUrl(appUrl, rows[0].user_id);
      await sendEmail({ to: rows[0].email, ...renderDigest(Array.from(perObligation.values()), appUrl, unsub), unsubscribeUrl: unsub });
      await admin.from("reminders").update({ status: "sent", sent_at: new Date().toISOString() }).in("id", ids);
      summary.sent += ids.length;
    } catch (e) {
      console.error("reminder send failed:", e instanceof Error ? e.message : e);
      // Leave as 'sending': claim_due_reminders retries after 30 minutes, up to 3 attempts.
      summary.failed += ids.length;
    }
  }

  // 5. Monthly items whose date has passed move to next month (and get new reminders). After
  //    sending, so the overdue notice for the one just missed goes out first.
  const { data: stale } = await admin
    .from("obligations")
    .select("id")
    .eq("status", "confirmed")
    .eq("trigger", "monthly")
    .neq("due_basis", "manual")
    .lt("due_date", today)
    .limit(BATCH);
  for (const o of stale ?? []) {
    try {
      await rescheduleObligation(admin, o.id as string, today);
      summary.rolled++;
    } catch (e) {
      console.error("roll monthly:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ today, ...summary });
}
