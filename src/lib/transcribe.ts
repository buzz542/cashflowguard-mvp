import type Anthropic from "@anthropic-ai/sdk";
import { textFrom, reasoningParams } from "./anthropic";
import { config } from "./config";

export const TRANSCRIBE_PROMPT =
  "This is a construction contract. Extract ALL readable text exactly as written, in reading order. Include headings, clause numbers, tables as plain text, and payment terms. Do not summarise. Output only the extracted text.";

type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** One photographed page → text. */
export async function transcribeImage(anthropic: Anthropic, buffer: Buffer, mimeType: string, model = config.anthropicModel): Promise<string> {
  const mediaType: ImageType = (["image/png", "image/gif", "image/webp"] as string[]).includes(mimeType)
    ? (mimeType as ImageType)
    : "image/jpeg";
  const message = await anthropic.messages.create({
    model,
    ...reasoningParams(model),
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") } },
          { type: "text", text: TRANSCRIBE_PROMPT }
        ]
      }
    ]
  });
  return textFrom(message);
}

/** A scanned PDF (no text layer): Claude reads the page images directly. */
export async function transcribeScannedPdf(anthropic: Anthropic, buffer: Buffer, model = config.anthropicModel): Promise<string> {
  const message = await anthropic.messages.create({
    model,
    ...reasoningParams(model),
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
          { type: "text", text: TRANSCRIBE_PROMPT }
        ]
      }
    ]
  });
  if (message.stop_reason === "max_tokens") throw new Error("scanned PDF transcription was cut off");
  return textFrom(message);
}
