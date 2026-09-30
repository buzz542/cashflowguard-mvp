import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { extractObligations } from "@/lib/extractObligations";

// A fake Messages API: records the request, replies with a canned structured-output message.
let server: http.Server;
let lastBody: Record<string, unknown> | null = null;
let reply: { stop_reason: string; text: string } = { stop_reason: "end_turn", text: "{}" };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastBody = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "test",
          content: [{ type: "text", text: reply.text }],
          stop_reason: reply.stop_reason,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
});
afterAll(() => server.close());

const client = () =>
  new Anthropic({ apiKey: "test", baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, maxRetries: 0 });

describe("extractObligations (against a fake API)", () => {
  it("sends a structured-output request and sanitises the parsed result", async () => {
    reply = {
      stop_reason: "end_turn",
      text: JSON.stringify({
        obligations: [
          {
            kind: "payment_application", title: "Submit payment application", clause_ref: "4.2",
            source_quote: "Applications for payment shall be made on the 25th of each month.",
            trigger: "monthly", fixed_date: null, day_of_month: 25, event_description: null,
            offset_days: null, direction: null, day_basis: "unspecified"
          },
          {
            kind: "variation_notice", title: "Notify variation", clause_ref: null,
            source_quote: "notify promptly", trigger: "event", fixed_date: null, day_of_month: null,
            event_description: "instruction", offset_days: null, direction: "after", day_basis: "unspecified"
          }
        ]
      })
    };
    const out = await extractObligations(client(), "CONTRACT TEXT", "Subcontractor");

    // Second item had no period → dropped, not guessed.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ trigger: "monthly", day_of_month: 25, clause_ref: "4.2" });

    const body = lastBody as { output_config?: { effort?: string; format?: { type: string; schema: Record<string, unknown> } }; messages: Array<{ content: string }>; system: Array<{ text: string; cache_control?: unknown }>; thinking?: unknown };
    expect(body.output_config?.format?.type).toBe("json_schema");
    const schema = JSON.stringify(body.output_config!.format!.schema);
    expect(schema).toContain('"additionalProperties":false');
    // Allowed values reach the model (as guidance: the SDK doesn't send `enum`, hence per-item validation).
    expect(schema).toContain("payment_application");
    expect(schema).toContain('"required":["kind","title"');
    // No zod safe-integer noise.
    expect(schema).not.toContain("9007199254740991");
    expect(body.messages[0].content).toContain("CONTRACT TEXT");
    expect(body.messages[0].content).toContain("Subcontractor");
    expect(body.system[0].text).toContain("Never invent");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    // Sonnet 5.5: thinking off via between_tools, effort alongside the schema.
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.output_config?.effort).toBe("high");
  });

  it("an out-of-list value in one item doesn't lose the others", async () => {
    const good = {
      kind: "final_account", title: "Submit final account", clause_ref: "9", source_quote: "within 3 months of completion",
      trigger: "event", fixed_date: null, day_of_month: null, event_description: "practical completion",
      offset_days: 90, direction: "after", day_basis: "calendar"
    };
    reply = { stop_reason: "end_turn", text: JSON.stringify({ obligations: [{ ...good, kind: "invented_kind" }, good] }) };
    const out = await extractObligations(client(), "x", "");
    expect(out.map((o) => o.title)).toEqual(["Submit final account"]);
  });

  it("throws when the model stops early, so the caller marks extraction failed", async () => {
    reply = { stop_reason: "max_tokens", text: '{"obligations":[' };
    await expect(extractObligations(client(), "x", "")).rejects.toThrow();
  });
});
