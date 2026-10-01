import { describe, it, expect } from "vitest";
import { canonicalEmail } from "@/lib/canonicalEmail";

describe("canonicalEmail", () => {
  it("lowercases and trims", () => {
    expect(canonicalEmail("  Bob@Example.COM ")).toBe("bob@example.com");
  });
  it("strips +tags on any domain", () => {
    expect(canonicalEmail("bob+free2@example.com")).toBe("bob@example.com");
    expect(canonicalEmail("bob+a+b@outlook.com")).toBe("bob@outlook.com");
  });
  it("collapses Gmail dots and googlemail alias", () => {
    expect(canonicalEmail("b.o.b@gmail.com")).toBe("bob@gmail.com");
    expect(canonicalEmail("B.O.B+x@googlemail.com")).toBe("bob@gmail.com");
  });
  it("keeps dots for non-Gmail domains", () => {
    expect(canonicalEmail("jo.smith@company.co.uk")).toBe("jo.smith@company.co.uk");
  });
  it("rejects junk", () => {
    for (const bad of ["", "nope", "@x.com", "a@", "a@b", "+tag@gmail.com", "a@@b.com", "x".repeat(250) + "@a.com"]) {
      expect(canonicalEmail(bad)).toBeNull();
    }
  });
});
