import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { streamReview, cleanReview } from "@/lib/reviewStream";
import { reasoningParams } from "@/lib/anthropic";

// A fake streaming Messages API: records the request, replies with SSE events.
let server: http.Server;
let body: Record<string, unknown> | null = null;
let headers: http.IncomingHttpHeaders = {};
let stopReason = "end_turn";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      body = JSON.parse(b);
      headers = req.headers;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const usage = { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 2048, cache_creation_input_tokens: 0 };
      res.write(sse("message_start", { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage } }));
      res.write(sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
      for (const t of ["## Contract ", "Action Plan\n", "- Retention 5%"]) {
        res.write(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }));
      }
      res.write(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
      res.write(sse("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 7 } }));
      res.write(sse("message_stop", { type: "message_stop" }));
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
});
afterAll(() => server.close());
const client = () => new Anthropic({ apiKey: "t", baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, maxRetries: 0 });

describe("streamReview (fake API)", () => {
  it("streams text chunks, caches the system prompt and reports usage", async () => {
    stopReason = "end_turn";
    const chunks: string[] = [];
    const out = await streamReview(client(), "claude-sonnet-5-5", "DOCUMENT", (t) => chunks.push(t));
    expect(chunks).toEqual(["## Contract ", "Action Plan\n", "- Retention 5%"]);
    expect(out.text).toBe("## Contract Action Plan\n- Retention 5%");
    expect(out.ttftMs).not.toBeNull();
    expect(out.cacheReadTokens).toBe(2048);
    expect(out.outputTokens).toBe(7);
    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      stream: true,
      thinking: { type: "between_tools" },
      output_config: { effort: "high" },
      fallbacks: "default"
    });
    const system = body!.system as Array<{ cache_control?: unknown; text: string }>;
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toMatch(/Watchlist/);
    expect(String(headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
  });
  it("treats a refusal as no result so the free check is refunded", async () => {
    stopReason = "refusal";
    const out = await streamReview(client(), "claude-sonnet-5-5", "DOCUMENT", () => undefined);
    expect(out.text).toBe("");
    expect(out.stopReason).toBe("refusal");
  });
  it("sends no Sonnet 5.5-only parameters to older models (for timing comparisons)", async () => {
    stopReason = "end_turn";
    await streamReview(client(), "claude-sonnet-4-5", "DOCUMENT", () => undefined);
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("output_config");
    expect(body).not.toHaveProperty("fallbacks");
  });
});

describe("reasoningParams", () => {
  it("turns thinking off with between_tools (disabled is a 400 on Sonnet 5.5)", () => {
    expect(reasoningParams("claude-sonnet-5-5", { anthropicThinking: "off", anthropicEffort: "high" })).toEqual({
      thinking: { type: "between_tools" },
      output_config: { effort: "high" }
    });
    expect(reasoningParams("claude-sonnet-5-5", { anthropicThinking: "adaptive", anthropicEffort: "low" })).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "low" }
    });
    expect(reasoningParams("claude-sonnet-4-5")).toEqual({});
  });
});

describe("cleanReview", () => {
  it("drops an echoed context preamble", () => {
    expect(cleanReview("**Project context used**\n- Trade: x\n\n## Contract Action Plan\nA")).toBe("## Contract Action Plan\nA");
  });
});
