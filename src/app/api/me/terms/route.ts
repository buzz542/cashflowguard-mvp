import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Records that the user accepted the current Terms (incl. "not legal advice"). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  if (body?.version !== TERMS_VERSION) {
    return jsonError(409, "The Terms have changed. Please reload and review them again.", "terms_version_mismatch");
  }

  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() })
    .eq("id", auth.user.id);
  if (error) {
    console.error("accept terms:", error.message);
    return jsonError(500, "Could not save. Please try again.");
  }
  return NextResponse.json({ ok: true });
}
