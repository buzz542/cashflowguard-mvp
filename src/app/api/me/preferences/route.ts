import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `{ reminderEmails: boolean }` */
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body.reminderEmails !== "boolean") return jsonError(400, "Nothing to change.");
  const { error } = await getSupabaseAdmin()
    .from("profiles")
    .update({ reminder_emails: body.reminderEmails })
    .eq("id", auth.user.id);
  if (error) {
    console.error("preferences:", error.message);
    return jsonError(500, "Could not save.");
  }
  return NextResponse.json({ reminderEmails: body.reminderEmails });
}
