import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Route handlers have maxDuration 60s; leave headroom and don't let SDK retries run past it.
  if (!client) client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  return client;
}

type Settings = { anthropicThinking: "off" | "adaptive"; anthropicEffort: "low" | "medium" | "high" };

/**
 * Thinking and effort for a model. Only Claude Sonnet 5.5 gets them: it rejects
 * `thinking: {type: "disabled"}` (so "off" is `between_tools`), and older models such as
 * Sonnet 4.5 reject `effort`. Anything else runs on the API defaults.
 */
export function reasoningParams(
  model: string,
  settings: Settings = config
): { thinking?: { type: "between_tools" } | { type: "adaptive" }; output_config?: { effort: Settings["anthropicEffort"] } } {
  if (model !== "claude-sonnet-5-5") return {};
  return {
    thinking: settings.anthropicThinking === "adaptive" ? { type: "adaptive" } : { type: "between_tools" },
    output_config: { effort: settings.anthropicEffort }
  };
}

/** A system prompt marked for prompt caching: it's identical on every call. */
export function cachedSystem(text: string) {
  return [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } }];
}

export function textFrom(message: { content: ReadonlyArray<{ type: string; text?: string }> }): string {
  let out = "";
  for (const block of message.content) {
    if (block.type === "text") out += block.text ?? "";
  }
  return out.trim();
}
