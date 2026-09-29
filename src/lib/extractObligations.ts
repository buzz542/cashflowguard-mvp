import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractionWireSchema, EXTRACTION_SYSTEM_PROMPT, sanitizeObligations, type Obligation } from "./obligations";
import { config } from "./config";

/**
 * Structured extraction of notice/payment deadlines. Runs alongside the review call
 * (the full contract text is only in memory for that request). Throws on API errors;
 * the caller decides whether that fails the request (it doesn't).
 */
export async function extractObligations(
  anthropic: Anthropic,
  contractText: string,
  role: string
): Promise<Obligation[]> {
  const message = await anthropic.messages.parse({
    model: config.extractionModel,
    max_tokens: 6000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `The user's role on this job: ${role || "not provided"}\n\nCONTRACT:\n${contractText}`
      }
    ],
    output_config: { format: zodOutputFormat(ExtractionWireSchema) }
  });
  if (message.stop_reason !== "end_turn") {
    throw new Error(`obligation extraction stopped: ${message.stop_reason}`);
  }
  return sanitizeObligations(message.parsed_output);
}
