import type { SupabaseClient } from "@supabase/supabase-js";

/** The caller's role in a workspace, or null if they aren't a member. */
export async function roleIn(admin: SupabaseClient, workspaceId: string, userId: string): Promise<"owner" | "member" | null> {
  const { data } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as "owner" | "member" | undefined) ?? null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
