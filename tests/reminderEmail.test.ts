import { describe, it, expect } from "vitest";
import { renderDigest, escapeHtml, formatUkDate } from "@/lib/reminderEmail";

describe("reminder email", () => {
  it("escapes contract-derived text", () => {
    const { html, text } = renderDigest(
      [{ title: '<img src=x onerror="alert(1)">', kind: "other", clauseRef: "<b>4</b>", dueDate: "2026-10-09", dueBasis: "fixed", jobName: "A & B", reminderKind: "due" }],
      "https://guardconstruct.com"
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("A &amp; B");
    expect(text).toContain('<img src=x onerror="alert(1)">'); // plain text part is not HTML
  });
  it("subject and ordering", () => {
    const d = renderDigest(
      [
        { title: "Later", kind: "other", clauseRef: null, dueDate: "2026-10-20", dueBasis: "calendar", jobName: null, reminderKind: "lead" },
        { title: "Sooner", kind: "payment_application", clauseRef: "5.1", dueDate: "2026-10-09", dueBasis: "monthly", jobName: "Job", reminderKind: "due" }
      ],
      "https://x"
    );
    expect(d.subject).toBe("2 contract deadlines due now");
    expect(d.text.indexOf("Sooner")).toBeLessThan(d.text.indexOf("Later"));
    expect(d.text).toContain("Counted in calendar days.");
    expect(d.text).toContain("not legal advice");
  });
  it("single item subject", () => {
    expect(renderDigest([{ title: "Apply for payment", kind: "payment_application", clauseRef: null, dueDate: "2026-10-09", dueBasis: null, jobName: null, reminderKind: "lead" }], "https://x").subject)
      .toBe("Coming up: Apply for payment");
  });
  it("helpers", () => {
    expect(escapeHtml(`'"&<>`)).toBe("&#39;&quot;&amp;&lt;&gt;");
    expect(formatUkDate("2026-10-09")).toBe("Fri 9 Oct 2026");
  });
});
