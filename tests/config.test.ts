import { describe, it, expect } from "vitest";
import { loadConfig, readInt, readBool } from "@/lib/config";

describe("config", () => {
  it("defaults match the product as shipped", () => {
    const c = loadConfig({});
    expect(c.freeReviewLimit).toBe(1);
    expect(c.anthropicModel).toBe("claude-sonnet-4-5");
  });
  it("reads overrides and rejects out-of-range values", () => {
    expect(readInt({ X: "5" }, "X", 1, 0, 10)).toBe(5);
    expect(readInt({ X: "50" }, "X", 1, 0, 10)).toBe(1);
    expect(readInt({ X: "2.5" }, "X", 1, 0, 10)).toBe(1);
    expect(readInt({ X: "" }, "X", 1, 0, 10)).toBe(1);
  });
  it("parses booleans", () => {
    expect(readBool({ B: "true" }, "B", false)).toBe(true);
    expect(readBool({ B: "0" }, "B", true)).toBe(false);
    expect(readBool({ B: "maybe" }, "B", true)).toBe(true);
  });
});
