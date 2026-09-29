import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One review. RLS returns nothing unless the user is a member of its workspace. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID.test(params.id)) return jsonError(404, "Not found.");

  const { data, error } = await createSupabaseServerClient()
    .from("reviews")
    .select("id, created_at, trade, role, project_size, duration, result_md, author_id, workspace_id")
    .eq("id", params.id)
    .maybeSingle();
  if (error) {
    console.error("get review:", error.message);
    return jsonError(500, "Could not load this review.");
  }
  if (!data) return jsonError(404, "Not found.");
  return NextResponse.json({ review: data });
}

/** Delete a review: its author, or the owner of its workspace. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!UUID.test(params.id)) return jsonError(404, "Not found.");

  const admin = getSupabaseAdmin();
  const { data: review } = await admin
    .from("reviews")
    .select("id, author_id, workspace_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!review) return jsonError(404, "Not found.");

  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", review.workspace_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  // Not a member: answer as if it doesn't exist.
  if (!membership) return jsonError(404, "Not found.");
  if (review.author_id !== auth.user.id && membership.role !== "owner") {
    return jsonError(403, "Only the person who ran this check, or the workspace owner, can delete it.");
  }

  const { error } = await admin.from("reviews").delete().eq("id", params.id);
  if (error) {
    console.error("delete review:", error.message);
    return jsonError(500, "Could not delete this review.");
  }
  return NextResponse.json({ ok: true });
}
