import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { roleIn, UUID_RE } from "@/lib/membership";
import { memberRanks, isProInWorkspace, subscriptionIsActive } from "@/lib/entitlements";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Members (with seat status), pending invites (owner only) and seat usage for one workspace. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(404, "Not found.");

  try {
    const admin = getSupabaseAdmin();
    const role = await roleIn(admin, params.id, auth.user.id);
    if (!role) return jsonError(404, "Not found.");

    const [{ data: ws }, { data: rows }, { data: sub }] = await Promise.all([
      admin.from("workspaces").select("id, name, personal, owner_id, comp_pro").eq("id", params.id).single(),
      admin.from("workspace_members").select("user_id, role, created_at, profiles!inner(email, name)").eq("workspace_id", params.id),
      admin.from("subscriptions").select("status, seat_count").eq("workspace_id", params.id).maybeSingle()
    ]);
    if (!ws) return jsonError(404, "Not found.");

    type M = { user_id: string; role: "owner" | "member"; created_at: string; profiles: { email: string; name: string | null } };
    const members = (rows ?? []) as unknown as M[];
    const ranks = memberRanks(ws.owner_id as string, members);
    const seatCount = (sub?.seat_count as number | undefined) ?? 1;
    const active = subscriptionIsActive(sub?.status as string | null);

    let invites: unknown[] = [];
    if (role === "owner") {
      const { data } = await admin
        .from("workspace_invites")
        .select("id, email, created_at, expires_at")
        .eq("workspace_id", params.id)
        .is("accepted_at", null)
        .order("created_at");
      invites = data ?? [];
    }

    return NextResponse.json({
      workspace: { id: ws.id, name: ws.name, personal: ws.personal, role },
      members: members
        .map((m) => ({
          userId: m.user_id,
          email: m.profiles.email,
          name: m.profiles.name || m.profiles.email.split("@")[0],
          role: m.role,
          joinedAt: m.created_at,
          hasSeat: isProInWorkspace({
            compPro: ws.comp_pro as boolean,
            subscriptionStatus: sub?.status as string | null,
            seatCount,
            memberRank: ranks.get(m.user_id) ?? -1
          })
        }))
        .sort((a, b) => (ranks.get(a.userId) ?? 99) - (ranks.get(b.userId) ?? 99)),
      invites,
      seats: { paid: active ? seatCount : 0, used: members.length, max: config.maxTeamSeats, subscriptionActive: active, compPro: ws.comp_pro }
    });
  } catch (e) {
    console.error("members:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not load the team.");
  }
}
