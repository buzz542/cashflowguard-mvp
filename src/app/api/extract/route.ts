import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

async function extractImageText(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — required to read photos of documents.");
  }

  const anthropic = new Anthropic({ apiKey });
  const mediaType = (
    mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp"
      ? mimeType
      : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const base64 = buffer.toString("base64");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64
            }
          },
          {
            type: "text",
            text:
              "This is a photo or scan of a construction contract page. Extract ALL readable text exactly as written, in reading order. Include headings, clause numbers, tables as plain text, and payment terms. Do not summarise. Output only the extracted text."
          }
        ]
      }
    ]
  });

  let text = "";
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
      }
    }
  }
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File is too large (max 12MB). Try a clearer photo or a smaller file." },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    const type = (file.type || "").toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (type.startsWith("text/") || /\.(txt|md|csv|text)$/i.test(name)) {
      return NextResponse.json({ text: buffer.toString("utf8"), fileName: file.name });
    }

    if (
      name.endsWith(".docx") ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value || "").trim();
      if (!text) {
        return NextResponse.json(
          { error: "Could not read text from this Word file." },
          { status: 400 }
        );
      }
      return NextResponse.json({ text, fileName: file.name });
    }

    if (name.endsWith(".doc")) {
      return NextResponse.json(
        { error: "Old .doc format is not supported. Save as .docx or photograph the pages." },
        { status: 400 }
      );
    }

    if (name.endsWith(".pdf") || type === "application/pdf") {
      return NextResponse.json(
        {
          error:
            "PDF upload is temporarily offline. Photograph each page (Take photo) or paste the text."
        },
        { status: 400 }
      );
    }

    if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) {
      if (/\.(heic|heif)$/i.test(name) || type.includes("heic") || type.includes("heif")) {
        return NextResponse.json(
          {
            error:
              "HEIC photos are not supported. On iPad, use JPEG / Most Compatible, or take the photo again."
          },
          { status: 400 }
        );
      }

      try {
        const text = await extractImageText(buffer, type || "image/jpeg");
        if (!text || text.length < 20) {
          return NextResponse.json(
            {
              error:
                "Could not read enough text from this photo. Use good light and fill the frame with the page."
            },
            { status: 400 }
          );
        }
        return NextResponse.json({ text, fileName: file.name });
      } catch (e: any) {
        console.error("Image extract error:", e);
        return NextResponse.json(
          { error: e.message || "Could not read this photo." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Unsupported file. Use a photo, Word (.docx), or paste text." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Extract error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to read file" },
      { status: 500 }
    );
  }
}
