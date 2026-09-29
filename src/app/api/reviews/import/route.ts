import { NextRequest, NextResponse } from "next/server";
import { requireUser, loadWorkspaceContext, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";
import { sanitizeImport } from "@/lib/reviewImport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One-off move of reviews saved in this browser (pre-accounts) into the user's
 * personal workspace. They were only ever the user's own results, so the worst a
 * forged payload can do is clutter their own history.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const rl = rateLimit(`import:${auth.user.id}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return jsonError(429, "Too many requests. Try again later.");

  const body = await req.json().catch(() => null);
  const items = sanitizeImport(body?.reviews);
  if (!items.length) return NextResponse.json({ imported: 0 });

  try {
    // Always the personal workspace, whatever is active: this was the user's own device history.
    const ctx = await loadWorkspaceContext(auth.user, auth.email, null);
    if (!ctx.workspace.personal) throw new Error("personal workspace not found");

    const { error } = await getSupabaseAdmin()
      .from("reviews")
      .insert(
        items.map((r) => ({
          workspace_id: ctx.workspace.id,
          author_id: auth.user.id,
          trade: r.trade,
          role: r.role,
          contract_preview: r.preview,
          result_md: r.result,
          model: "unknown",
          prompt_version: "imported-from-device",
          created_at: r.createdAt
        }))
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ imported: items.length });
  } catch (e) {
    console.error("import reviews:", e instanceof Error ? e.message : e);
    return jsonError(500, "Could not import your saved reviews.");
  }
}
