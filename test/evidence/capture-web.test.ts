import { describe, it, expect } from "vitest";
import { parseCropRatio } from "../../src/lib/evidence/capture-web";

describe("parseCropRatio", () => {
  it("reads the deck's own notation", () => {
    expect(parseCropRatio("4:5")).toBeCloseTo(0.8);
    expect(parseCropRatio("16:9")).toBeCloseTo(16 / 9);
    expect(parseCropRatio(" 1 : 1 ")).toBe(1);
  });

  it("falls back to 4:5 for anything it cannot read", () => {
    // The schema defaults to 4:5, so an absent or malformed ratio must land there too —
    // a NaN viewport height throws inside Playwright with a far less obvious message.
    for (const bad of [undefined, "", "portrait", "4/5", "0:5", "4:0", "-4:5"]) {
      expect(parseCropRatio(bad as any)).toBeCloseTo(0.8);
    }
  });
});
