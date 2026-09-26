"use client";

import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 shrink-0"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Render review markdown with copy buttons on suggested-wording blockquotes */
export default function ReviewResults({ result }: { result: string }) {
  const lines = result.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Suggested wording label + following blockquote(s)
    if (/^\*\*Suggested wording:\*\*/i.test(line) || /^Suggested wording:/i.test(line)) {
      nodes.push(
        <p key={key++} className="font-semibold text-gray-900 mt-3 mb-1">
          Suggested wording
        </p>
      );
      i++;
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith(">") || lines[i].trim() === "")) {
        if (lines[i].startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
        } else if (quoteLines.length) {
          break;
        }
        i++;
      }
      const quote = quoteLines.join("\n").trim();
      if (quote) {
        nodes.push(
          <div
            key={key++}
            className="bg-blue-50 border border-blue-100 rounded-xl p-3 my-2 flex gap-2 items-start"
          >
            <p className="text-sm text-gray-800 flex-1 whitespace-pre-wrap leading-relaxed">{quote}</p>
            <CopyButton text={quote} />
          </div>
        );
      }
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={key++} className="text-base font-bold text-gray-900 mt-5 mb-2">
          {line.replace(/^###\s*/, "")}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={key++} className="text-lg font-bold text-gray-900 mt-6 mb-2 border-b border-gray-100 pb-1">
          {line.replace(/^##\s*/, "")}
        </h2>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="my-4 border-gray-200" />);
      i++;
      continue;
    }

    // Bold label lines like **Clause / reference:**
    const boldLabel = line.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (boldLabel) {
      nodes.push(
        <p key={key++} className="text-sm text-gray-800 mt-2 leading-relaxed">
          <span className="font-semibold text-gray-900">{boldLabel[1]}</span>
          {boldLabel[2] ? <> {boldLabel[2]}</> : null}
        </p>
      );
      i++;
      continue;
    }

    // Blockquote without label
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const quote = quoteLines.join("\n").trim();
      nodes.push(
        <div
          key={key++}
          className="bg-gray-50 border border-gray-200 rounded-xl p-3 my-2 flex gap-2 items-start"
        >
          <p className="text-sm text-gray-800 flex-1 whitespace-pre-wrap">{quote}</p>
          <CopyButton text={quote} />
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Bullet
    if (/^[-*]\s/.test(line)) {
      nodes.push(
        <p key={key++} className="text-sm text-gray-800 leading-relaxed pl-1">
          • {line.replace(/^[-*]\s+/, "")}
        </p>
      );
      i++;
      continue;
    }

    // Numbered
    if (/^\d+\.\s/.test(line)) {
      nodes.push(
        <p key={key++} className="text-sm text-gray-800 leading-relaxed">
          {line}
        </p>
      );
      i++;
      continue;
    }

    nodes.push(
      <p key={key++} className="text-sm text-gray-800 leading-relaxed">
        {line}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{nodes}</div>;
}
