import type Anthropic from "@anthropic-ai/sdk";
import { REVIEW_SYSTEM_PROMPT } from "./reviewPrompt";
import { reasoningParams, cachedSystem, textFrom } from "./anthropic";

export type ReviewOutcome = {
  text: string;
  stopReason: string | null;
  /** First visible text, ms after the request started. */
  ttftMs: number | null;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Runs the review and hands each chunk of text to `onText` as it arrives.
 * The system prompt is cached (identical on every call). On Claude Sonnet 5.5, a
 * policy decline is retried server-side on the fallback model (`fallbacks: "default"`).
 */
export async function streamReview(
  anthropic: Anthropic,
  model: string,
  userMessage: string,
  onText: (delta: string) => void
): Promise<ReviewOutcome> {
  const started = Date.now();
  let ttftMs: number | null = null;
  const fallback = model === "claude-sonnet-5-5";
  const stream = anthropic.beta.messages.stream({
    model,
    max_tokens: 8000,
    system: cachedSystem(REVIEW_SYSTEM_PROMPT),
    messages: [{ role: "user", content: userMessage }],
    ...reasoningParams(model),
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {})
  });
  stream.on("text", (delta) => {
    if (ttftMs === null) ttftMs = Date.now() - started;
    onText(delta);
  });
  const message = await stream.finalMessage();
  return {
    text: message.stop_reason === "refusal" ? "" : textFrom(message),
    stopReason: message.stop_reason,
    ttftMs,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens
  };
}

/** The model sometimes echoes the pre-flight context before the plan; drop it. */
export function cleanReview(text: string): string {
  return text
    .replace(/^\s*\*?\*?Project context used\*?\*?[\s\S]*?(?=##\s*Contract Action Plan|##\s*Executive|##\s*Risk|###\s*[🔴🟠🟢]|$)/i, "")
    .trim();
}
