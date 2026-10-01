const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Collapse aliases of one inbox to a single key for the free-tier ledger:
 * lowercases, drops "+tag" sub-addresses, and for Gmail ignores dots and the
 * googlemail.com alias. Returns null for anything that isn't a plausible address.
 *
 * Deliberately over-merges rather than under-merges: two genuinely different
 * "a+b@corp.com" / "a@corp.com" users sharing one free check is an acceptable cost.
 */
export function canonicalEmail(input: string): string | null {
  const email = (input || "").trim().toLowerCase();
  if (email.length > 254) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  if (/[@\s]/.test(local)) return null;

  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }

  if (!local) return null;
  return `${local}@${domain}`;
}
