import { describe, it, expect } from "vitest";
import { fitWithin, MAX_IMAGE_EDGE } from "@/lib/uploadPrep";

describe("fitWithin", () => {
  it("scales a 12MP phone photo down to the long-edge limit", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1176, height: MAX_IMAGE_EDGE });
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_IMAGE_EDGE, height: 1176 });
  });
  it("never upscales", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
  it("keeps tiny dimensions at least 1px", () => expect(fitWithin(100000, 10)).toEqual({ width: 1568, height: 1 }));
});
