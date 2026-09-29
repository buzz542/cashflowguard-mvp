import { NextResponse } from "next/server";
import { requireUser, jsonError, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { subscriptionIsActive } from "@/lib/entitlements";
import { accountDeletionBlocker } from "@/lib/accountDeletion";
import { reassignAfterMemberLeft } from "@/lib/reminderScheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Permanently delete the caller's account `{ confirm: "DELETE" }`. Deleting the auth user
 * cascades to their profile, the workspaces they own (with reviews, jobs, deadlines) and
 * their memberships. The free-tier ledger is kept so deletion can't reset the free check.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") return jsonError(400, "Type DELETE to confirm.", "confirm_required");

  try {
    const admin = getSupabaseAdmin();
    const { data: owned } = await admin.from("workspaces").select("id, name, personal").eq("owner_id", auth.user.id);
    const ownedRows = (owned ?? []) as Array<{ id: string; name: string; personal: boolean }>;
    const ids = ownedRows.map((w) => w.id);

    const [{ data: subs }, { data: members }] = await Promise.all([
      ids.length ? admin.from("subscriptions").select("workspace_id, status").in("workspace_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", ids) : Promise.resolve({ data: [] })
    ]);
    const nameOf = (id: string) => {
      const w = ownedRows.find((x) => x.id === id);
      return w?.personal ? "your personal plan" : w?.name ?? "a workspace";
    };
    const memberRows = (members ?? []) as Array<{ workspace_id: string; user_id: string }>;
    const blocker = accountDeletionBlocker({
      ownedWorkspacesWithActiveSubscription: ((subs ?? []) as Array<{ workspace_id: string; status: string | null }>)
        .filter((s) => subscriptionIsActive(s.status))
        .map((s) => nameOf(s.workspace_id)),
      ownedTeamsWithOtherMembers: ownedRows
        .filter((w) => !w.personal && memberRows.some((m) => m.workspace_id === w.id && m.user_id !== auth.user.id))
        .map((w) => w.name)
    });
    if (blocker) return jsonError(409, blocker.error, blocker.code);

    // Leave other people's teams properly first, so deadlines assigned to this user get
    // re-routed to a teammate rather than silently losing their reminders.
    const { data: memberships } = await admin
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", auth.user.id)
      .eq("role", "member");
    for (const m of (memberships ?? []) as Array<{ workspace_id: string }>) {
      await admin.from("workspace_members").delete().eq("workspace_id", m.workspace_id).eq("user_id", auth.user.id);
      await reassignAfterMemberLeft(admin, m.workspace_id, auth.user.id);
    }

    const { error } = await admin.auth.admin.deleteUser(auth.user.id);
    if (error) throw new Error(error.message);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("delete account:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not delete your account. Please contact us.");
  }
}
