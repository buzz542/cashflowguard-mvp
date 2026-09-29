import { describe, it, expect } from "vitest";
import { newInviteToken, hashInviteToken, looksLikeInviteToken } from "@/lib/invites";

describe("invite tokens", () => {
  it("are random, URL-safe, and only the hash is kept", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(looksLikeInviteToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashInviteToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects junk", () => {
    for (const bad of ["", "short", "has spaces in it and is long enough to pass length", 42, null, "x".repeat(65)]) {
      expect(looksLikeInviteToken(bad)).toBe(false);
    }
  });
});
