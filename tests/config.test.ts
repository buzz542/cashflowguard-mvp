import { describe, it, expect } from "vitest";
import { loadConfig, readInt, readBool } from "@/lib/config";

describe("config", () => {
  it("defaults match the product as shipped", () => {
    const c = loadConfig({});
    expect(c.freeReviewLimit).toBe(1);
    expect(c.anthropicModel).toBe("claude-sonnet-5-5");
    expect(c.anthropicThinking).toBe("off");
    expect(c.anthropicEffort).toBe("high");
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

import { resolveAppOrigin } from "@/lib/config";

describe("resolveAppOrigin", () => {
  const url = "https://cashflowguard-abc123-buzz542s-projects.vercel.app/api/checkout";
  it("explicit setting wins", () => {
    expect(resolveAppOrigin({ NEXT_PUBLIC_APP_URL: "https://guardconstruct.com/" }, "https://x.vercel.app", url)).toBe("https://guardconstruct.com");
  });
  it("production never returns a per-deployment URL", () => {
    expect(resolveAppOrigin({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "guardconstruct.com" }, "https://cashflowguard-abc123-buzz542s-projects.vercel.app", url)).toBe("https://guardconstruct.com");
  });
  it("previews and local dev use the request origin", () => {
    expect(resolveAppOrigin({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "guardconstruct.com" }, "https://preview.vercel.app", url)).toBe("https://preview.vercel.app");
    expect(resolveAppOrigin({}, null, "http://localhost:3000/api/x")).toBe("http://localhost:3000");
  });
});
