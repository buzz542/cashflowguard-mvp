import { describe, it, expect } from "vitest";
import { historyLimit, canOpenReview, PRO_HISTORY_LIMIT } from "@/lib/historyAccess";

describe("history access", () => {
  it("Pro lists everything (up to the page size), free lists only the latest", () => {
    expect(historyLimit(true)).toBe(PRO_HISTORY_LIMIT);
    expect(historyLimit(false)).toBe(1);
  });
  it("free users can open only their own latest check", () => {
    expect(canOpenReview(false, "a", "a")).toBe(true);
    expect(canOpenReview(false, "old", "a")).toBe(false);
    expect(canOpenReview(false, "a", null)).toBe(false);
    expect(canOpenReview(true, "old", "a")).toBe(true);
  });
});
