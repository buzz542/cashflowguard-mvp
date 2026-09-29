import { createHash, randomBytes } from "node:crypto";

/** A random invite token for the link, and the hash we store. The token itself is never stored. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function looksLikeInviteToken(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(v);
}

export const ACCEPT_MESSAGES: Record<string, { status: number; error: string }> = {
  invalid: { status: 404, error: "This invite link isn't valid or has already been used." },
  expired: { status: 410, error: "This invite has expired. Ask the team owner for a new one." },
  email_mismatch: { status: 403, error: "This invite was sent to a different email address. Log in with that address to accept it." },
  not_a_team: { status: 400, error: "This invite isn't for a team workspace." },
  full: { status: 409, error: "This team is full." }
};
