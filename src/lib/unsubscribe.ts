import { createHmac, timingSafeEqual } from "node:crypto";

/** Signs unsubscribe links. UNSUBSCRIBE_SECRET, else CRON_SECRET (set wherever emails are sent). */
function secret(env: Record<string, string | undefined> = process.env): string {
  return env.UNSUBSCRIBE_SECRET || env.CRON_SECRET || "";
}

export function unsubscribeToken(userId: string, key = secret()): string {
  return createHmac("sha256", key).update(`unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribe(userId: string, token: string, key = secret()): boolean {
  if (!key || !userId || !token) return false;
  const a = Buffer.from(unsubscribeToken(userId, key));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Null when there's no secret to sign with. */
export function unsubscribeUrl(appUrl: string, userId: string, key = secret()): string | null {
  if (!key) return null;
  return `${appUrl}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId, key)}`;
}
