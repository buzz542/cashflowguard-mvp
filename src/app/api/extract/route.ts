import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const type = file.type || "";

    // Plain text
    if (type.startsWith("text/") || /\.(txt|md|csv|text)$/i.test(name)) {
      const text = await file.text();
      return NextResponse.json({ text, fileName: file.name });
    }

    // Word .docx
    if (
      name.endsWith(".docx") ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value || "").trim();
      if (!text) {
        return NextResponse.json(
          { error: "Could not read text from this Word file. Try pasting the text instead." },
          { status: 400 }
        );
      }
      return NextResponse.json({ text, fileName: file.name });
    }

    // Old .doc not supported by mammoth
    if (name.endsWith(".doc")) {
      return NextResponse.json(
        {
          error:
            "Old .doc format is not supported. Save as .docx in Word, or copy the text and paste it."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload a .docx or .txt file, or paste the contract text."
      },
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
