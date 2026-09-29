/**
 * The small subset of markdown the review prompt produces, parsed into blocks.
 * Kept deliberately narrow: no HTML, no links (model output is untrusted).
 */

export type Block =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "hr" }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "wording"; text: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseReview(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\*\*Suggested wording:\*\*/i.test(line) || /^Suggested wording:/i.test(line)) {
      i++;
      const quote: string[] = [];
      while (i < lines.length && (lines[i].startsWith(">") || lines[i].trim() === "")) {
        if (lines[i].startsWith(">")) quote.push(lines[i].replace(/^>\s?/, ""));
        else if (quote.length) break;
        i++;
      }
      const text = quote.join("\n").trim();
      if (text) out.push({ type: "wording", text });
      continue;
    }

    if (line.startsWith("### ")) {
      out.push({ type: "h3", text: line.replace(/^###\s*/, "") });
    } else if (line.startsWith("## ")) {
      out.push({ type: "h2", text: line.replace(/^##\s*/, "") });
    } else if (line.startsWith("---")) {
      out.push({ type: "hr" });
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const kind = BULLET.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? BULLET : NUMBERED;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(re.exec(lines[i])![1]);
        i++;
      }
      out.push({ type: kind, items });
      continue;
    } else if (line.trim() !== "") {
      out.push({ type: "p", text: line });
    }
    i++;
  }
  return out;
}

/** Split a line into plain and **bold** segments. */
export function boldSegments(text: string): Array<{ bold: boolean; text: string }> {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .filter((p) => p !== "")
    .map((p) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? { bold: true, text: p.slice(2, -2) } : { bold: false, text: p }));
}
