import { createHash } from "node:crypto";

/**
 * IPs are personal data under UK GDPR, so the free-tier ledger stores a salted hash.
 * Set IP_HASH_SALT to a long random string; rotating it resets per-IP counts.
 */
export function hashIp(ip: string, salt = process.env.IP_HASH_SALT || ""): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
