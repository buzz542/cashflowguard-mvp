import { NextRequest, NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { roleIn } from "@/lib/membership";
import { parseHelpRequest, renderHelpEmail, HELP_CONSENT } from "@/lib/helpRequest";
import { emailConfigured, sendEmail } from "@/lib/email";
import { appOrigin } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Need help getting paid?" Saves the request and emails the owner (ADMIN_EMAIL).
 * Never passed to anyone else automatically.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const rl = rateLimit(`help:${auth.user.id}`, 5, 24 * 60 * 60 * 1000);
  if (!rl.ok) return jsonError(429, "You've sent several requests today. We'll be in touch; reply to our email if it's urgent.");

  try {
    const parsed = parseHelpRequest(await req.json().catch(() => null));
    if (!parsed.ok) return jsonError(400, parsed.error);
    const r = parsed.value;
    const admin = getSupabaseAdmin();

    // Link the tracked item or check only if it's the caller's to link.
    let workspaceId: string | null = null;
    let obligationId: string | null = null;
    let reviewId: string | null = null;
    let itemTitle: string | null = null;
    if (r.obligationId) {
      const { data: o } = await admin.from("obligations").select("id, workspace_id, title").eq("id", r.obligationId).maybeSingle();
      if (o && (await roleIn(admin, o.workspace_id, auth.user.id))) {
        obligationId = o.id as string;
        workspaceId = o.workspace_id as string;
        itemTitle = o.title as string;
      }
    }
    if (r.reviewId) {
      const { data: rv } = await admin.from("reviews").select("id, workspace_id").eq("id", r.reviewId).maybeSingle();
      if (rv && (await roleIn(admin, rv.workspace_id, auth.user.id))) {
        reviewId = rv.id as string;
        workspaceId = workspaceId ?? (rv.workspace_id as string);
      }
    }

    const { data: row, error } = await admin
      .from("help_requests")
      .insert({
        user_id: auth.user.id,
        workspace_id: workspaceId,
        obligation_id: obligationId,
        review_id: reviewId,
        amount_pence: r.amountPence,
        debtor: r.debtor,
        days_overdue: r.daysOverdue,
        pay_less_notice: r.payLessNotice,
        contact_name: r.contactName,
        contact_email: r.contactEmail,
        contact_phone: r.contactPhone,
        notes: r.notes,
        consent: true,
        consent_text: HELP_CONSENT
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "insert failed");

    const to = process.env.ADMIN_EMAIL?.trim();
    if (to && emailConfigured()) {
      try {
        const mail = renderHelpEmail({ ...r, id: row.id as string, accountEmail: auth.email, itemTitle }, appOrigin(req));
        await sendEmail({ to, ...mail, replyTo: r.contactEmail });
        await admin.from("help_requests").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
      } catch (e) {
        // Saved either way; the owner can find it in the table.
        console.error("help request email failed:", e instanceof Error ? e.message : e);
      }
    } else {
      console.error("help request saved but not emailed: ADMIN_EMAIL or email provider not configured");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("help request:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not send your request. Please try again.");
  }
}
