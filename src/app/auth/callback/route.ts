import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "magiclink", "email", "recovery", "invite", "email_change"]);

/**
 * Landing point for magic-link and email-confirmation links.
 * - `?code=` (Supabase default, PKCE): only works in the browser that asked for the link.
 * - `?token_hash=&type=` (custom email template, see README): works on any device.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const home = new URL("/", url.origin);
  const fail = () => {
    home.searchParams.set("auth", "error");
    return NextResponse.redirect(home);
  };
  if (!supabaseConfigured()) return fail();

  const supabase = createSupabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let error: unknown = null;
  if (tokenHash && type && OTP_TYPES.has(type)) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    return fail();
  }
  if (error) return fail();

  home.searchParams.set("auth", "ok");
  return NextResponse.redirect(home);
}
