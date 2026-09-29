import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Route handlers have maxDuration 60s; leave headroom and don't let SDK retries run past it.
  if (!client) client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  return client;
}

export function textFrom(message: Anthropic.Message): string {
  let out = "";
  for (const block of message.content) {
    if (block.type === "text") out += block.text;
  }
  return out.trim();
}
