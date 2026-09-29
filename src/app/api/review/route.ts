import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { requireUser, loadWorkspaceContext, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAnthropic, textFrom } from "@/lib/anthropic";
import { REVIEW_SYSTEM_PROMPT } from "@/lib/reviewPrompt";
import { config, PROMPT_VERSION, EXTRACTION_VERSION } from "@/lib/config";
import { extractObligations } from "@/lib/extractObligations";
import { remindersAllowed, OBLIGATION_COLUMNS } from "@/lib/reminderScheduler";
import type { Obligation } from "@/lib/obligations";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { hashIp } from "@/lib/ipHash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTRACT_CHARS = 120_000;

const FREE_LIMIT_MESSAGES: Record<string, { status: number; error: string; code: string }> = {
  user_limit: { status: 402, error: "You've used your free check. Upgrade to Pro for unlimited checks.", code: "upgrade_required" },
  ip_limit: { status: 429, error: "Free check limit reached for this network today. Upgrade to Pro or try tomorrow.", code: "ip_limit" },
  global_limit: { status: 503, error: "Free checks are paused for today because of demand. Upgrade to Pro or try again tomorrow.", code: "free_paused" }
};

function field(ctx: Record<string, unknown>, key: string, max: number): string {
  const v = ctx[key];
  return typeof v === "string" ? v.slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("response" in auth) return auth.response;
    const { user, email } = auth;

    const rl = rateLimit(`review:${user.id}`, config.reviewsPerUserPerHour, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many checks in a short time. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const anthropic = getAnthropic();
    if (!anthropic) return jsonError(500, "Service temporarily unavailable.");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(400, "Invalid request.");

    const contractText = typeof body.contractText === "string" ? body.contractText : "";
    const context = body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : {};
    if (!contractText.trim()) return jsonError(400, "No contract text provided.");
    if (contractText.length > MAX_CONTRACT_CHARS) {
      return jsonError(400, "Document is too large. Upload fewer pages or a shorter extract.");
    }

    const ctx = await loadWorkspaceContext(user, email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
    if (!ctx.profile.termsAccepted) {
      return jsonError(403, "Please accept the Terms before running a check.", "terms_required");
    }

    const admin = getSupabaseAdmin();

    // Free tier: claim atomically before spending on the AI call; refund if the call fails.
    let freeEventId: string | null = null;
    if (!ctx.isPro) {
      const canonical = canonicalEmail(email);
      if (!canonical) return jsonError(400, "Your account email address isn't valid.");
      const { data, error } = await admin.rpc("claim_free_review", {
        p_canonical_email: canonical,
        p_ip_hash: hashIp(clientIp(req)),
        p_user_limit: config.freeReviewLimit,
        p_ip_daily_limit: config.freeReviewsPerIpPerDay,
        p_global_daily_limit: config.freeReviewsGlobalPerDay
      });
      if (error) throw new Error(`claim_free_review: ${error.message}`);
      const claim = (Array.isArray(data) ? data[0] : data) as { status: string; event_id: string | null } | null;
      if (!claim || claim.status !== "ok") {
        const m = FREE_LIMIT_MESSAGES[claim?.status ?? "user_limit"] ?? FREE_LIMIT_MESSAGES.user_limit;
        return jsonError(m.status, m.error, m.code);
      }
      freeEventId = claim.event_id;
    }

    const trade = field(context, "trade", 120);
    const projectSize = field(context, "projectSize", 80);
    const duration = field(context, "duration", 80);
    const role = field(context, "role", 80);

    const userMessage = `Pre-flight context (weight severity only; do not restate in output):
- Trade: ${trade || "not provided"}
- Package size band: ${projectSize || "not provided"}
- Duration: ${duration || "not provided"}
- Role: ${role || "not provided"}

DOCUMENT TO REVIEW:
${contractText}`;

    // Deadline extraction runs alongside the review: the contract text is only in memory now.
    const canTrack = remindersAllowed(ctx.isPro);
    const extraction: Promise<{ ok: true; list: Obligation[] } | { ok: false }> | null = canTrack
      ? extractObligations(anthropic, contractText, role).then(
          (list) => ({ ok: true as const, list }),
          (e) => {
            console.error("Obligation extraction failed:", e instanceof Error ? e.message : e);
            return { ok: false as const };
          }
        )
      : null;

    let result = "";
    try {
      const message = await anthropic.messages.create({
        model: config.anthropicModel,
        max_tokens: 8000,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }]
      });
      result = textFrom(message);
    } catch (e) {
      if (freeEventId) await admin.rpc("refund_free_review", { p_event_id: freeEventId });
      throw e;
    }

    if (!result) {
      if (freeEventId) await admin.rpc("refund_free_review", { p_event_id: freeEventId });
      return jsonError(502, "No response was generated. Please try again. This check was not counted.");
    }

    result = result
      .replace(/^\s*\*?\*?Project context used\*?\*?[\s\S]*?(?=##\s*Contract Action Plan|##\s*Executive|##\s*Risk|###\s*[🔴🟠🟢]|$)/i, "")
      .trim();

    const { data: saved, error: saveErr } = await admin
      .from("reviews")
      .insert({
        workspace_id: ctx.workspace.id,
        author_id: user.id,
        trade: trade || null,
        role: role || null,
        project_size: projectSize || null,
        duration: duration || null,
        result_md: result,
        model: config.anthropicModel,
        prompt_version: PROMPT_VERSION,
        extraction_status: canTrack ? null : "not_run"
      })
      .select("id, created_at")
      .single();
    // The user has paid for this result (in money or their free check): return it even if saving failed.
    if (saveErr) console.error("Review save failed:", saveErr.message);

    let obligations: unknown[] = [];
    let extractionStatus: "ok" | "failed" | "not_run" = "not_run";
    if (extraction) {
      const ex = await extraction;
      extractionStatus = ex.ok ? "ok" : "failed";
      if (ex.ok && ex.list.length && saved?.id) {
        const { data: rows, error: obErr } = await admin
          .from("obligations")
          .insert(
            ex.list.map((o) => ({
              ...o,
              workspace_id: ctx.workspace.id,
              review_id: saved.id,
              status: "suggested",
              extraction_version: EXTRACTION_VERSION
            }))
          )
          .select(OBLIGATION_COLUMNS);
        if (obErr) {
          console.error("Obligation save failed:", obErr.message);
          extractionStatus = "failed";
        } else {
          obligations = rows ?? [];
        }
      }
      if (saved?.id) await admin.from("reviews").update({ extraction_status: extractionStatus }).eq("id", saved.id);
    }

    return NextResponse.json({
      result,
      isPro: ctx.isPro,
      reviewId: saved?.id ?? null,
      saved: !saveErr,
      canTrackDeadlines: canTrack,
      extraction: extractionStatus,
      obligations
    });
  } catch (error: unknown) {
    console.error("Review error:", error instanceof Error ? error.message : error);
    return jsonError(500, "Review failed. Please try again.");
  }
}
