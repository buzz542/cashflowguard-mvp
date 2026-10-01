import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { transcribeImage, transcribeScannedPdf } from "@/lib/transcribe";

let server: http.Server;
let body: { messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>; max_tokens: number } | null = null;
let stop = "end_turn";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      body = JSON.parse(b);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "t", content: [{ type: "text", text: " 4.2 Payment ... " }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
});
afterAll(() => server.close());
const client = () => new Anthropic({ apiKey: "t", baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, maxRetries: 0 });

describe("transcription (fake API)", () => {
  it("sends a scanned PDF as a document block and returns trimmed text", async () => {
    stop = "end_turn";
    expect(await transcribeScannedPdf(client(), Buffer.from("%PDF-1.4"))).toBe("4.2 Payment ...");
    expect(body!.messages[0].content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    expect(body!.max_tokens).toBe(16000);
  });
  it("refuses a cut-off transcription rather than returning half a contract", async () => {
    stop = "max_tokens";
    await expect(transcribeScannedPdf(client(), Buffer.from("%PDF"))).rejects.toThrow(/cut off/);
  });
  it("sends photos as image blocks, defaulting unknown types to JPEG", async () => {
    stop = "end_turn";
    await transcribeImage(client(), Buffer.from("x"), "image/heic");
    expect(body!.messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  });
});
