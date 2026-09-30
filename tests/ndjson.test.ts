import { describe, it, expect } from "vitest";
import { readNdjson, mapLimit } from "@/lib/ndjson";

function streamOf(parts: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    }
  });
}

describe("readNdjson", () => {
  it("handles lines split across chunks and a final line with no newline", async () => {
    const seen: unknown[] = [];
    await readNdjson(streamOf(['{"type":"del', 'ta","text":"a"}\n{"type":"done"', "}\n", '{"type":"x"}']), (e) => seen.push(e));
    expect(seen).toEqual([{ type: "delta", text: "a" }, { type: "done" }, { type: "x" }]);
  });
  it("skips malformed lines", async () => {
    const seen: unknown[] = [];
    await readNdjson(streamOf(["nope\n", '{"ok":1}\n']), (e) => seen.push(e));
    expect(seen).toEqual([{ ok: 1 }]);
  });
});

describe("mapLimit", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], 3, async (ms, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(3);
  });
});
