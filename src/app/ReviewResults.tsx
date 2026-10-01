"use client";

import { useState, type ReactNode } from "react";
import { parseReview, boldSegments } from "@/lib/reviewMarkdown";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="shrink-0 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((seg, i) => (seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>))}
    </>
  );
}

/** Render review markdown with copy buttons on suggested-wording blockquotes */
export default function ReviewResults({ result }: { result: string }) {
  const nodes: ReactNode[] = parseReview(result).map((b, key) => {
    switch (b.type) {
      case "h2":
        return <h2 key={key} className="text-lg font-bold text-gray-900 mt-6 mb-2">{b.text}</h2>;
      case "h3":
        return <h3 key={key} className="text-base font-bold text-gray-900 mt-5 mb-2">{b.text}</h3>;
      case "hr":
        return <hr key={key} className="my-4 border-gray-200" />;
      case "ul":
      case "ol": {
        const List = b.type;
        return (
          <List key={key} className={`${b.type === "ul" ? "list-disc" : "list-decimal"} pl-5 space-y-1 my-2 text-sm text-gray-800 leading-relaxed`}>
            {b.items.map((it, j) => (
              <li key={j}><Inline text={it} /></li>
            ))}
          </List>
        );
      }
      case "wording":
        return (
          <div key={key}>
            <p className="font-semibold text-gray-900 mt-3 mb-1">Suggested wording</p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 my-2 flex gap-2 items-start">
              <p className="text-sm text-gray-800 flex-1 whitespace-pre-wrap leading-relaxed">{b.text}</p>
              <CopyButton text={b.text} />
            </div>
          </div>
        );
      default:
        return (
          <p key={key} className="text-sm text-gray-800 leading-relaxed my-1 whitespace-pre-wrap">
            <Inline text={b.text} />
          </p>
        );
    }
  });

  return (
    <div className="space-y-1">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 mb-4">
        <p className="font-semibold">Automated AI summary</p>
        <p className="mt-0.5">
          This was written by AI and has not been checked by a person or a solicitor. It is a commercial risk aid,
          not legal advice, and it may be incomplete or wrong. Suggested wording is a starting point only. Before you
          sign, refuse, or send anything that matters, get it checked by a qualified professional.
        </p>
      </div>
      {nodes}
    </div>
  );
}
