import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase/server";
import { loadWorkspaceContext, jsonError } from "./session";
import { canonicalEmail } from "./canonicalEmail";
import { config } from "./config";
import { ukToday } from "./deadlines";

/**
 * Photo pages cost an AI call each. Pro reads photos freely (hourly speed bump only).
 * Everyone else must still have a free check left, and is capped per day, per person
 * and service-wide, in Postgres so restarts and extra instances don't reset it.
 *
 * Returns `{ ok: true, refund }` or `{ ok: false, response }`.
 */
export async function claimPhotoPage(user: User, email: string, activeWorkspaceId?: string | null) {
  const ctx = await loadWorkspaceContext(user, email, activeWorkspaceId);
  if (ctx.isPro) return { ok: true as const, refund: async () => undefined };

  const admin = getSupabaseAdmin();
  const canonical = canonicalEmail(email);
  const { data: fa } = canonical
    ? await admin.from("free_allowance").select("used").eq("canonical_email", canonical).maybeSingle()
    : { data: null };
  if (((fa?.used as number | undefined) ?? 0) >= config.freeReviewLimit) {
    return {
      ok: false as const,
      response: jsonError(402, "You've used your free check. Upgrade to Pro to read photos of contracts.", "upgrade_required")
    };
  }

  const day = ukToday();
  const { data, error } = await admin.rpc("claim_ocr_page", {
    p_user_id: user.id,
    p_day: day,
    p_user_daily_limit: config.freeOcrPagesPerDay,
    p_global_daily_limit: config.freeOcrPagesGlobalPerDay
  });
  if (error) throw new Error(`claim_ocr_page: ${error.message}`);
  if (data === "user_limit") {
    return {
      ok: false as const,
      response: jsonError(
        429,
        `Free accounts can read up to ${config.freeOcrPagesPerDay} photo pages a day. Upload a PDF or Word file, paste the text, or upgrade to Pro.`,
        "ocr_limit"
      )
    };
  }
  if (data === "global_limit") {
    return {
      ok: false as const,
      response: jsonError(503, "Photo reading is paused for free accounts today. Upload a PDF or Word file, or paste the text.", "ocr_paused")
    };
  }
  return {
    ok: true as const,
    refund: async () => {
      await admin.rpc("refund_ocr_page", { p_user_id: user.id, p_day: day });
    }
  };
}
