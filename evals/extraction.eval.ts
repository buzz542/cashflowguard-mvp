/**
 * Runs deadline extraction against the fixtures with the real API and reports recall /
 * precision. Needs ANTHROPIC_API_KEY (costs a few pence). `npm run eval:extraction`
 */
import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { extractObligations } from "../src/lib/extractObligations";
import { score } from "../src/lib/evalScore";
import { FIXTURES } from "./extractionFixtures";

const hasKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasKey)("deadline extraction eval", () => {
  it("meets the bar on the fixtures", async () => {
    const client = new Anthropic();
    let hit = 0, expected = 0, extracted = 0;
    for (const f of FIXTURES) {
      const out = await extractObligations(client, f.text, f.role);
      const s = score(out, f.expected);
      hit += s.hit; expected += s.expected; extracted += s.extracted;
      console.log(`${f.name}: recall ${s.hit}/${s.expected}, precision ${s.hit}/${s.extracted}`);
      for (const m of s.missed) console.log("  missed:", JSON.stringify(m));
      for (const x of s.extra) console.log("  extra:", x.kind, x.trigger, x.offset_days ?? x.day_of_month ?? x.fixed_date, "-", x.title);
    }
    const recall = hit / expected, precision = extracted ? hit / extracted : 0;
    console.log(`TOTAL recall ${(recall * 100).toFixed(0)}%  precision ${(precision * 100).toFixed(0)}%`);
    expect(recall).toBeGreaterThanOrEqual(0.8);
    expect(precision).toBeGreaterThanOrEqual(0.7);
  }, 180_000);
});
