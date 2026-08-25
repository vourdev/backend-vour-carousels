import { describe, it, expect } from "vitest";
import { judgeShot, THRESHOLDS, type ShotMetrics } from "../../src/lib/evidence/validate";

/** A shot that passes everything, so each case can move one number at a time. */
const good: ShotMetrics = {
  bytes: 180_000,
  nearWhitePct: 0.42,
  dominantPct: 0.38,
  distinctBuckets: 64,
};

describe("judgeShot", () => {
  it("accepts a picture of a real page", () => {
    expect(judgeShot(good)).toMatchObject({ ok: true });
  });

  it("rejects a file too small to be a rendered page", () => {
    expect(judgeShot({ ...good, bytes: THRESHOLDS.minBytes - 1 })).toMatchObject({
      ok: false,
      reason: "too-small",
    });
  });

  it("rejects a mostly blank canvas — the shape a 404 or an unpainted page takes", () => {
    expect(judgeShot({ ...good, nearWhitePct: 0.93 })).toMatchObject({
      ok: false,
      reason: "mostly-blank",
    });
  });

  it("rejects a flat sheet of one colour — a full-viewport overlay or consent wall", () => {
    // Not white, so `mostly-blank` cannot be what catches this one.
    expect(judgeShot({ ...good, nearWhitePct: 0.02, dominantPct: 0.97 })).toMatchObject({
      ok: false,
      reason: "flat-overlay",
    });
  });

  it("rejects an image with almost no distinct colours", () => {
    expect(judgeShot({ ...good, distinctBuckets: 3 })).toMatchObject({
      ok: false,
      reason: "no-detail",
    });
  });

  it("keeps a busy screenshot even when it is a light design", () => {
    // A cream marketing page is legitimately mostly pale. It must not be mistaken for blank.
    expect(judgeShot({ ...good, nearWhitePct: 0.71, dominantPct: 0.68, distinctBuckets: 22 })).toMatchObject({
      ok: true,
    });
  });
});
