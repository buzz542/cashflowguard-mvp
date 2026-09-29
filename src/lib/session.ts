import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, getSupabaseAdmin, supabaseConfigured } from "./supabase/server";
import { isProInWorkspace } from "./entitlements";
import { TERMS_VERSION } from "./config";

export type WorkspaceContext = {
  user: User;
  email: string;
  profile: { name: string | null; termsAccepted: boolean };
  workspace: { id: string; name: string; personal: boolean; role: "owner" | "member" };
  isPro: boolean;
  subscription: {
    status: string | null;
    stripeCustomerId: string | null;
    seatCount: number;
    currentPeriodEnd: string | null;
  } | null;
};

export function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

/**
 * The signed-in user, verified with Supabase Auth (not just a cookie decode).
 * Returns a ready-made error response when there isn't one.
 */
export async function requireUser(): Promise<{ user: User; email: string } | { response: NextResponse }> {
  if (!supabaseConfigured()) {
    return { response: jsonError(503, "Accounts are not configured.", "not_configured") };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user || !user.email) {
    return { response: jsonError(401, "Please log in.", "unauthenticated") };
  }
  if (!user.email_confirmed_at) {
    return { response: jsonError(403, "Please confirm your email address first.", "email_unconfirmed") };
  }
  return { user, email: user.email.toLowerCase() };
}

/**
 * Loads the user's active workspace and entitlement. Phase 1: always the personal
 * workspace. `requestedWorkspaceId` is honoured only if the user is a member.
 */
export async function loadWorkspaceContext(
  user: User,
  email: string,
  requestedWorkspaceId?: string | null
): Promise<WorkspaceContext> {
  const admin = getSupabaseAdmin();

  const [{ data: profile }, { data: memberships, error: mErr }] = await Promise.all([
    admin.from("profiles").select("name, terms_version").eq("id", user.id).maybeSingle(),
    admin
      .from("workspace_members")
      .select("role, created_at, workspaces!inner(id, name, personal, comp_pro, owner_id)")
      .eq("user_id", user.id)
  ]);
  if (mErr) throw new Error(`loadWorkspaceContext: ${mErr.message}`);

  type Row = {
    role: "owner" | "member";
    workspaces: { id: string; name: string; personal: boolean; comp_pro: boolean; owner_id: string };
  };
  const rows = (memberships ?? []) as unknown as Row[];
  const chosen =
    rows.find((r) => requestedWorkspaceId && r.workspaces.id === requestedWorkspaceId) ??
    rows.find((r) => r.workspaces.personal) ??
    rows[0];
  if (!chosen) throw new Error("loadWorkspaceContext: user has no workspace");

  const ws = chosen.workspaces;
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, stripe_customer_id, seat_count, current_period_end")
    .eq("workspace_id", ws.id)
    .maybeSingle();

  const memberRank = await rankInWorkspace(ws.id, ws.owner_id, user.id);

  return {
    user,
    email,
    profile: {
      name: (profile?.name as string | null) ?? null,
      termsAccepted: profile?.terms_version === TERMS_VERSION
    },
    workspace: { id: ws.id, name: ws.name, personal: ws.personal, role: chosen.role },
    isPro: isProInWorkspace({
      compPro: ws.comp_pro,
      subscriptionStatus: (sub?.status as string | null) ?? null,
      seatCount: (sub?.seat_count as number | undefined) ?? 1,
      memberRank
    }),
    subscription: sub
      ? {
          status: (sub.status as string | null) ?? null,
          stripeCustomerId: (sub.stripe_customer_id as string | null) ?? null,
          seatCount: (sub.seat_count as number) ?? 1,
          currentPeriodEnd: (sub.current_period_end as string | null) ?? null
        }
      : null
  };
}

/** Owner is seat 0; everyone else by join date. Used to decide who is inside the paid seats. */
async function rankInWorkspace(workspaceId: string, ownerId: string, userId: string): Promise<number> {
  if (userId === ownerId) return 0;
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("workspace_members")
    .select("user_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  const others = (data ?? []).filter((m) => m.user_id !== ownerId).map((m) => m.user_id as string);
  const idx = others.indexOf(userId);
  return idx < 0 ? -1 : idx + 1;
}

/** Cookie holding the workspace the user last switched to (Phase 3). */
export const ACTIVE_WORKSPACE_COOKIE = "gc_ws";
