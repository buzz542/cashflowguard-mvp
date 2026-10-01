import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { rateLimit } from "@/lib/rateLimit";
import { requireUser, ACTIVE_WORKSPACE_COOKIE } from "@/lib/session";
import { claimPhotoPage, claimPhotoPages } from "@/lib/ocrAllowance";
import { getAnthropic } from "@/lib/anthropic";
import { transcribeImage, transcribeScannedPdf } from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Scanned PDFs longer than this are refused: transcription must fit one response. */
const MAX_SCANNED_PDF_PAGES = 20;

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: number }> {
  // Import the implementation directly — avoids pdf-parse's broken default test-file path on Vercel
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string; numpages: number }>;
  const data = await pdfParse(buffer);
  return { text: (data.text || "").trim(), pages: data.numpages || 1 };
}

function requireAnthropic() {
  const anthropic = getAnthropic();
  if (!anthropic) throw new Error("OCR_UNAVAILABLE");
  return anthropic;
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

    // The browser shrinks photos first; Vercel rejects bodies over ~4.5MB before we get here anyway.
    if (file.size > 4.5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File is too large (max 4MB). Split it, photograph the pages, or paste the text." },
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
      let parsed: { text: string; pages: number };
      try {
        parsed = await extractPdfText(buffer);
      } catch (e: unknown) {
        console.error("PDF extract error:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Could not read this PDF. Photograph the pages or paste the text." }, { status: 400 });
      }
      if (parsed.text.length >= 40) return NextResponse.json({ text: parsed.text, fileName: file.name });

      // No text layer: it's a scan. Read it like photos (counts against the free page cap).
      if (parsed.pages > MAX_SCANNED_PDF_PAGES) {
        return NextResponse.json(
          { error: `This looks like a scanned PDF of ${parsed.pages} pages. Split it into files of up to ${MAX_SCANNED_PDF_PAGES} pages, or photograph the key pages.` },
          { status: 400 }
        );
      }
      const claim = await claimPhotoPages(auth.user, auth.email, req.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value, parsed.pages);
      if (!claim.ok) return claim.response;
      try {
        const text = await transcribeScannedPdf(requireAnthropic(), buffer);
        if (text.length < 40) {
          return NextResponse.json({ error: "Could not read enough text from this scan. Try photographing the pages in good light." }, { status: 400 });
        }
        return NextResponse.json({ text, fileName: file.name });
      } catch (e: unknown) {
        await claim.refund().catch(() => undefined);
        console.error("Scanned PDF error:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "Could not read this scanned PDF. Photograph the pages or paste the text." }, { status: 500 });
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
        const text = await transcribeImage(requireAnthropic(), buffer, type || "image/jpeg");
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
