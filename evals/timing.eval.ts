/**
 * Times a full check (read the file, then review + deadline extraction in parallel, as
 * /api/review does) for a photo, a PDF and a Word file, on the old and the new model.
 * Needs ANTHROPIC_API_KEY (a few pence per run). `npm run eval:timing`
 * Writes evals/timing-results.md; copy the table into docs/DECISIONS.md.
 */
import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { createRequire } from "node:module";
import { transcribeImage } from "../src/lib/transcribe";
import { streamReview } from "../src/lib/reviewStream";
import { extractObligations } from "../src/lib/extractObligations";

const hasKey = !!process.env.ANTHROPIC_API_KEY;
const MODELS = (process.env.TIMING_MODELS || "claude-sonnet-4-5,claude-sonnet-5-5").split(",");
const dir = path.join(process.cwd(), "evals", "fixtures");

async function readFile(kind: string, client: Anthropic, model: string): Promise<string> {
  if (kind === "Word") return (await mammoth.extractRawText({ path: path.join(dir, "sample-subcontract.docx") })).value;
  if (kind === "PDF") {
    const pdfParse = createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;
    return (await pdfParse(fs.readFileSync(path.join(dir, "sample-subcontract.pdf")))).text;
  }
  return transcribeImage(client, fs.readFileSync(path.join(dir, "sample-subcontract-photo.jpg")), "image/jpeg", model);
}

describe.skipIf(!hasKey)("check timing", () => {
  it("old vs new model", async () => {
    const client = new Anthropic({ maxRetries: 0 });
    const rows: string[] = [];
    for (const kind of ["Photo", "PDF", "Word"]) {
      for (const model of MODELS) {
        const t0 = Date.now();
        const text = await readFile(kind, client, model);
        const tRead = Date.now() - t0;
        const t1 = Date.now();
        const userMessage = `Pre-flight context (weight severity only; do not restate in output):\n- Trade: Electrical\n- Role: Subcontractor\n\nDOCUMENT TO REVIEW:\n${text}`;
        const [review] = await Promise.all([
          streamReview(client, model, userMessage, () => undefined),
          extractObligations(client, text, "Subcontractor", model)
        ]);
        const tCheck = Date.now() - t1;
        const row = `| ${kind} | ${model} | ${(tRead / 1000).toFixed(1)}s | ${((review.ttftMs ?? 0) / 1000).toFixed(1)}s | ${(tCheck / 1000).toFixed(1)}s | ${((tRead + tCheck) / 1000).toFixed(1)}s | ${review.outputTokens} |`;
        console.log(row);
        rows.push(row);
      }
    }
    const table = [
      `Measured ${new Date().toISOString().slice(0, 10)} on evals/fixtures/sample-subcontract.* (one page).`,
      "",
      "| Input | Model | Read file | First text | Review + deadlines | Total | Output tokens |",
      "|---|---|---|---|---|---|---|",
      ...rows
    ].join("\n");
    fs.writeFileSync(path.join(process.cwd(), "evals", "timing-results.md"), table + "\n");
  }, 600_000);
});
