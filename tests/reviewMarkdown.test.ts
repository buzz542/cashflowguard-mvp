import { describe, it, expect } from "vitest";
import { parseReview, boldSegments } from "@/lib/reviewMarkdown";

const sample = `## Contract Action Plan
### 🚨 Deal with before signing
- Retention of **5%** held to whole-project completion
- Pay-when-paid in clause 4.3

---

### 🔴 RED — Pay when paid
**Clause / reference:** 4.3
**Suggested wording:**
> Please could you confirm clause 4.3
> is deleted?

## Your key actions
1. Clarify clause 4.3.
2) Diary the 7-day notice.

## Suggested next step
**Raise these points before signing** — retention and pay-when-paid.`;

describe("parseReview", () => {
  const blocks = parseReview(sample);
  it("turns bullet and numbered lines into lists", () => {
    expect(blocks).toContainEqual({ type: "ul", items: ["Retention of **5%** held to whole-project completion", "Pay-when-paid in clause 4.3"] });
    expect(blocks).toContainEqual({ type: "ol", items: ["Clarify clause 4.3.", "Diary the 7-day notice."] });
  });
  it("keeps suggested wording as one copyable block", () => {
    expect(blocks).toContainEqual({ type: "wording", text: "Please could you confirm clause 4.3\nis deleted?" });
  });
  it("headings, rules and paragraphs in order", () => {
    expect(blocks.map((b) => b.type)).toEqual(["h2", "h3", "ul", "hr", "h3", "p", "wording", "h2", "ol", "h2", "p"]);
  });
  it("bold clause labels are not mistaken for list items", () => {
    expect(parseReview("**Clause / reference:** 4.3")).toEqual([{ type: "p", text: "**Clause / reference:** 4.3" }]);
  });
});

describe("boldSegments", () => {
  it("splits bold runs", () => {
    expect(boldSegments("a **b** c")).toEqual([{ bold: false, text: "a " }, { bold: true, text: "b" }, { bold: false, text: " c" }]);
  });
  it("leaves stray asterisks alone", () => expect(boldSegments("5 * 3")).toEqual([{ bold: false, text: "5 * 3" }]));
});
