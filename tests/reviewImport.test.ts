import { describe, it, expect } from "vitest";
import { sanitizeImport, MAX_IMPORT } from "@/lib/reviewImport";

const NOW = Date.UTC(2026, 8, 29);

describe("sanitizeImport", () => {
  it("keeps valid items and trims fields", () => {
    const out = sanitizeImport([{ createdAt: "2026-09-20T10:00:00.000Z", trade: " Electrical ", role: "Subcontractor", preview: "abc", result: "## Plan" }], NOW);
    expect(out).toEqual([{ createdAt: "2026-09-20T10:00:00.000Z", trade: "Electrical", role: "Subcontractor", preview: "abc", result: "## Plan" }]);
  });
  it("drops items without a result or with a huge one", () => {
    expect(sanitizeImport([{ result: "" }, { result: 5 }, null, "x", { result: "x".repeat(200_001) }], NOW)).toEqual([]);
  });
  it("replaces bad or future dates with now", () => {
    const out = sanitizeImport([{ createdAt: "garbage", result: "a" }, { createdAt: "2099-01-01T00:00:00Z", result: "b" }], NOW);
    expect(out.map((r) => r.createdAt)).toEqual([new Date(NOW).toISOString(), new Date(NOW).toISOString()]);
  });
  it("caps the number of items and field lengths", () => {
    const many = Array.from({ length: 50 }, () => ({ result: "r", trade: "t".repeat(500), preview: "p".repeat(500) }));
    const out = sanitizeImport(many, NOW);
    expect(out).toHaveLength(MAX_IMPORT);
    expect(out[0].trade).toHaveLength(120);
    expect(out[0].preview).toHaveLength(200);
  });
  it("ignores non-arrays", () => {
    expect(sanitizeImport({ result: "x" }, NOW)).toEqual([]);
    expect(sanitizeImport(undefined, NOW)).toEqual([]);
  });
});
