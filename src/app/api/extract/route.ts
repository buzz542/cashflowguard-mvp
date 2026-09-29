import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { claimPhotoPage } from "@/lib/ocrAllowance";
import { getAnthropic, textFrom } from "@/lib/anthropic";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Import the implementation directly — avoids pdf-parse's broken default test-file path on Vercel
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return (data.text || "").trim();
}

async function extractImageText(buffer: Buffer, mimeType: string): Promise<string> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    throw new Error("OCR_UNAVAILABLE");
  }

  const mediaType = (
    mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp"
      ? mimeType
      : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const base64 = buffer.toString("base64");

  const message = await anthropic.messages.create({
    model: config.anthropicModel,
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

  return textFrom(message);
}

export async function POST(req: NextRequest) {
  try {
    // Photo OCR is a paid AI call, so uploads need an account.
    const auth = await requireUser();
    if ("response" in auth) return auth.response;

    const rl = rateLimit(`extract:${auth.user.id}`, 30, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Rate limit reached. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File is too large (max 12MB). Try a clearer photo or a smaller PDF." },
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
      try {
        const text = await extractPdfText(buffer);
        if (!text || text.length < 40) {
          return NextResponse.json(
            {
              error:
                "This PDF has little selectable text (likely a scan). Photograph each page instead."
            },
            { status: 400 }
          );
        }
        return NextResponse.json({ text, fileName: file.name });
      } catch (e: unknown) {
        console.error("PDF extract error:", e);
        return NextResponse.json(
          {
            error: "Could not read this PDF. Photograph the pages or paste the text."
          },
          { status: 400 }
        );
      }
    }

    if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) {
      if (/\.(heic|heif)$/i.test(name) || type.includes("heic") || type.includes("heif")) {
        return NextResponse.json(
          {
            error:
              "HEIC photos are not supported. Switch iPhone camera to Most Compatible (JPEG) or take a screenshot."
          },
          { status: 400 }
        );
      }
      const page = await claimPhotoPage(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value);
      if (!page.ok) return page.response;
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
      } catch (e: unknown) {
        // The AI call failed: don't charge the page against the daily cap.
        await page.refund().catch(() => undefined);
        console.error("Image extract error:", e);
        return NextResponse.json(
          { error: "Could not read this photo. Try better light or paste the text." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Unsupported file. Use a photo, PDF, Word (.docx), or paste text." },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("Extract error:", error);
    return NextResponse.json(
      { error: "Failed to read file. Try another format or paste the text." },
      { status: 500 }
    );
  }
}
