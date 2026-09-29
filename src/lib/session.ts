import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, getSupabaseAdmin, supabaseConfigured } from "./supabase/server";
import { isProInWorkspace, memberRanks } from "./entitlements";
import { TERMS_VERSION } from "./config";

export type WorkspaceContext = {
  user: User;
  email: string;
  profile: { name: string | null; termsAccepted: boolean };
  workspace: { id: string; name: string; personal: boolean; role: "owner" | "member" };
  /** Every workspace the user belongs to, for the switcher. */
  workspaces: Array<{ id: string; name: string; personal: boolean; role: "owner" | "member" }>;
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
    workspaces: rows
      .map((r) => ({ id: r.workspaces.id, name: r.workspaces.name, personal: r.workspaces.personal, role: r.role }))
      .sort((a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name)),
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

/** Pro status of a user in a specific workspace (used where there's no request context, e.g. cron). */
export async function isUserProInWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const [{ data: ws }, { data: sub }] = await Promise.all([
    admin.from("workspaces").select("owner_id, comp_pro").eq("id", workspaceId).maybeSingle(),
    admin.from("subscriptions").select("status, seat_count").eq("workspace_id", workspaceId).maybeSingle()
  ]);
  if (!ws) return false;
  return isProInWorkspace({
    compPro: ws.comp_pro as boolean,
    subscriptionStatus: (sub?.status as string | null) ?? null,
    seatCount: (sub?.seat_count as number | undefined) ?? 1,
    memberRank: await rankInWorkspace(workspaceId, ws.owner_id as string, userId)
  });
}

/** Owner is seat 0; everyone else by join date. Used to decide who is inside the paid seats. */
export async function rankInWorkspace(workspaceId: string, ownerId: string, userId: string): Promise<number> {
  if (userId === ownerId) return 0;
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("workspace_members").select("user_id, created_at").eq("workspace_id", workspaceId);
  return memberRanks(ownerId, (data ?? []) as Array<{ user_id: string; created_at: string }>).get(userId) ?? -1;
}

/** Cookie holding the workspace the user last switched to (Phase 3). */
export const ACTIVE_WORKSPACE_COOKIE = "gc_ws";
