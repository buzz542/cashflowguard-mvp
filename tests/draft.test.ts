import { describe, it, expect } from "vitest";
import { parseDraft } from "@/lib/draft";

describe("parseDraft", () => {
  it("round-trips an upload draft", () => {
    const d = { step: "upload", context: { trade: "Electrical", projectSize: "£10k–£50k", duration: "1–3 months", role: "Subcontractor" }, contractText: "Clause 4...", pages: ["p1.jpg"] };
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });
  it("keeps only a valid review id for results", () => {
    expect(parseDraft(JSON.stringify({ step: "results", reviewId: "10000000-0000-0000-0000-0000000000d1" }))).toEqual({ step: "results", reviewId: "10000000-0000-0000-0000-0000000000d1" });
    expect(parseDraft(JSON.stringify({ step: "results", reviewId: "../../x" }))).toBeNull();
  });
  it("loading is remembered as loading only", () => expect(parseDraft('{"step":"loading","contractText":"x"}')).toEqual({ step: "loading" }));
  it("junk → null", () => {
    for (const bad of [null, "", "not json", "[]", '{"step":"landing"}', '{"step":"history"}']) expect(parseDraft(bad)).toBeNull();
  });
  it("clamps and cleans fields", () => {
    const d = parseDraft(JSON.stringify({ step: "context", context: { trade: "t".repeat(500), role: 5 }, contractText: 7, pages: ["a", 3, "b"] }));
    expect(d).toEqual({ step: "context", context: { trade: "t".repeat(120), projectSize: "", duration: "", role: "" }, contractText: "", pages: ["a", "b"] });
  });
});
