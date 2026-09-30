import { describe, it, expect } from "vitest";
import { renderDigest, escapeHtml, formatUkDate, moreUrgent } from "@/lib/reminderEmail";

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
    expect(d.subject).toBe("2 contract dates: due now");
    expect(d.text.indexOf("Sooner")).toBeLessThan(d.text.indexOf("Later"));
    expect(d.text).toContain("Counted in calendar days.");
    expect(d.text).toContain("Not legal advice");
    expect(d.text).toContain("Reminders are a prompt only. Check your contract for exact dates.");
  });
  it("single item subject", () => {
    expect(renderDigest([{ title: "Apply for payment", kind: "payment_application", clauseRef: null, dueDate: "2026-10-09", dueBasis: null, jobName: null, reminderKind: "lead" }], "https://x").subject)
      .toBe("Coming up: Apply for payment");
  });
  it("overdue first, with the help prompt; unsubscribe link when given", () => {
    const d = renderDigest(
      [
        { title: "Heads up", kind: "other", clauseRef: null, dueDate: "2026-10-01", dueBasis: "fixed", jobName: null, reminderKind: "lead7" },
        { title: "Payment from Northgate", kind: "payment_due", clauseRef: null, dueDate: "2026-10-20", dueBasis: "fixed", jobName: "Riverside", reminderKind: "overdue" }
      ],
      "https://x",
      "https://x/api/unsubscribe?u=1&t=2"
    );
    expect(d.subject).toBe("2 contract dates: overdue or due");
    expect(d.text.indexOf("Payment from Northgate")).toBeLessThan(d.text.indexOf("Heads up"));
    expect(d.text).toContain("Overdue: was due Tue 20 Oct 2026");
    expect(d.text).toContain("Payment due");
    expect(d.html).toContain("Need help getting paid?");
    expect(d.html).toContain('href="https://x/api/unsubscribe?u=1&amp;t=2"');
    expect(d.text).toContain("Unsubscribe from reminder emails: https://x/api/unsubscribe?u=1&t=2");
    expect(renderDigest([{ title: "T", kind: "other", clauseRef: null, dueDate: "2026-10-20", dueBasis: null, jobName: null, reminderKind: "overdue" }], "https://x").subject).toBe("Overdue: T");
  });
  it("moreUrgent keeps the most urgent kind", () => {
    expect(moreUrgent(undefined, "lead7")).toBe("lead7");
    expect(moreUrgent("lead7", "due")).toBe("due");
    expect(moreUrgent("overdue", "due")).toBe("overdue");
  });
  it("helpers", () => {
    expect(escapeHtml(`'"&<>`)).toBe("&#39;&quot;&amp;&lt;&gt;");
    expect(formatUkDate("2026-10-09")).toBe("Fri 9 Oct 2026");
  });
});
