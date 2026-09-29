/**
 * Client-safe password hashing helpers (Web Crypto).
 * Used so we never store plaintext passwords in localStorage.
 * This is NOT a substitute for server-side auth — it only reduces
 * plaintext credential exposure on a shared device.
 */

export async function hashPassword(password: string, email: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${email.toLowerCase().trim()}::${password}::gc-v1`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(
  password: string,
  email: string,
  storedHash: string
): Promise<boolean> {
  const hash = await hashPassword(password, email);
  return hash === storedHash;
}
