import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { roleIn, UUID_RE } from "@/lib/membership";
import { newInviteToken } from "@/lib/invites";
import { config, appOrigin } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { emailConfigured, sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/reminderEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Invite someone by email `{ email }` (owner, team workspaces only). Returns the link
 * once, so the owner can share it themselves if email isn't set up or doesn't arrive.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!config.teamsEnabled) return jsonError(404, "Teams aren't available yet.");
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID_RE.test(params.id)) return jsonError(404, "Not found.");

  const rl = rateLimit(`invite:${auth.user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return jsonError(429, "Too many invites. Try again later.");

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return jsonError(400, "Enter a valid email address.");

  try {
    const admin = getSupabaseAdmin();
    if ((await roleIn(admin, params.id, auth.user.id)) !== "owner") return jsonError(403, "Only the team owner can invite people.");
    const { data: ws } = await admin.from("workspaces").select("name, personal").eq("id", params.id).single();
    if (!ws || ws.personal) return jsonError(400, "Create a team first. Personal workspaces can't have members.");

    const [{ data: members }, { count: pendingCount }] = await Promise.all([
      admin.from("workspace_members").select("user_id, profiles!inner(email)").eq("workspace_id", params.id),
      admin
        .from("workspace_invites")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", params.id)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
    ]);
    const memberEmails = ((members ?? []) as unknown as Array<{ profiles: { email: string } }>).map((m) => m.profiles.email);
    if (memberEmails.includes(email)) return jsonError(409, "They're already in this team.");
    if (memberEmails.length + (pendingCount ?? 0) >= config.maxTeamSeats) {
      return jsonError(409, `Teams can have up to ${config.maxTeamSeats} people, including pending invites.`, "team_full");
    }

    // Replace any earlier pending invite to the same address (the old link stops working).
    await admin.from("workspace_invites").delete().eq("workspace_id", params.id).eq("email", email).is("accepted_at", null);

    const { token, hash } = newInviteToken();
    const expires = new Date(Date.now() + config.inviteTtlDays * 24 * 60 * 60 * 1000);
    const { data: invite, error } = await admin
      .from("workspace_invites")
      .insert({ workspace_id: params.id, email, token_hash: hash, invited_by: auth.user.id, expires_at: expires.toISOString() })
      .select("id, email, created_at, expires_at")
      .single();
    if (error || !invite) throw new Error(error?.message ?? "insert failed");

    const link = `${appOrigin(req)}/?invite=${token}`;
    let emailed = false;
    if (emailConfigured()) {
      try {
        const team = ws.name as string;
        await sendEmail({
          to: email,
          subject: `You've been invited to ${team} on GuardConstruct`.slice(0, 120),
          text: `${auth.email} has invited you to join ${team} on GuardConstruct.\n\nAccept: ${link}\n\nThe link works for ${config.inviteTtlDays} days and only for ${email}.`,
          html: `<p>${escapeHtml(auth.email)} has invited you to join <strong>${escapeHtml(team)}</strong> on GuardConstruct.</p>
<p><a href="${escapeHtml(link)}">Accept the invite</a></p>
<p style="color:#6b7280;font-size:12px">The link works for ${config.inviteTtlDays} days and only for ${escapeHtml(email)}.</p>`
        });
        emailed = true;
      } catch (e) {
        console.error("invite email:", e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ invite, link, emailed });
  } catch (e) {
    console.error("invite:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not create the invite.");
  }
}
