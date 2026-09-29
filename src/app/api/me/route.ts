import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getSupabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";
import { loadWorkspaceContext, ACTIVE_WORKSPACE_COOKIE, jsonError } from "@/lib/session";
import { canonicalEmail } from "@/lib/canonicalEmail";
import { config, TERMS_VERSION } from "@/lib/config";
import { remindersAllowed } from "@/lib/reminderScheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Everything the UI needs about the signed-in user. `{ user: null }` when signed out. */
export async function GET(req: NextRequest) {
  try {
    // termsVersion is needed signed-out too: the signup form records acceptance of it.
    if (!supabaseConfigured()) return NextResponse.json({ user: null, accountsEnabled: false, termsVersion: TERMS_VERSION });

    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user?.email) return NextResponse.json({ user: null, accountsEnabled: true, termsVersion: TERMS_VERSION });

    const email = user.email.toLowerCase();
    const ctx = await loadWorkspaceContext(user, email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);

    const { data: prefs } = await getSupabaseAdmin().from("profiles").select("reminder_emails").eq("id", user.id).maybeSingle();

    const canonical = canonicalEmail(email);
    let used = 0;
    if (canonical) {
      const { data: fa } = await getSupabaseAdmin()
        .from("free_allowance")
        .select("used")
        .eq("canonical_email", canonical)
        .maybeSingle();
      used = (fa?.used as number | undefined) ?? 0;
    }

    return NextResponse.json({
      accountsEnabled: true,
      user: {
        id: user.id,
        email,
        name: ctx.profile.name || email.split("@")[0],
        emailConfirmed: !!user.email_confirmed_at
      },
      termsAccepted: ctx.profile.termsAccepted,
      termsVersion: TERMS_VERSION,
      workspace: ctx.workspace,
      workspaces: ctx.workspaces,
      isPro: ctx.isPro,
      subscription: ctx.subscription
        ? { status: ctx.subscription.status, currentPeriodEnd: ctx.subscription.currentPeriodEnd, seatCount: ctx.subscription.seatCount }
        : null,
      canManageBilling: ctx.workspace.role === "owner" && !!ctx.subscription?.stripeCustomerId,
      free: { limit: config.freeReviewLimit, used, remaining: Math.max(0, config.freeReviewLimit - used) },
      canTrackDeadlines: remindersAllowed(ctx.isPro),
      reminderEmails: (prefs?.reminder_emails as boolean | undefined) ?? true
    });
  } catch (e) {
    console.error("me error:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not load your account.");
  }
}
