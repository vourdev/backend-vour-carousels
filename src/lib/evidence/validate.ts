import type { Browser } from "playwright";

/**
 * The automated stand-in for a human looking at the screenshot.
 *
 * Nothing here understands what the page said — it only answers "is this a picture of
 * something". That is enough to catch what actually goes wrong unattended: a 404 page, a
 * site that never painted, a consent wall we failed to dismiss, a login screen. All of
 * them come back as a near-empty or near-flat image, and all of them would otherwise be
 * captured, uploaded and scheduled to Instagram as evidence.
 *
 * A rejection is not an error. The slide falls back to the mockup it would have had if
 * the screenshot had never been attempted.
 */

export interface ShotMetrics {
  bytes: number;
  /** Fraction of sampled pixels that are essentially white. */
  nearWhitePct: number;
  /** Fraction taken by the single most common colour — a flat overlay approaches 1. */
  dominantPct: number;
  /** Colour buckets holding at least 0.5% of the image; detail-less pages are tiny here. */
  distinctBuckets: number;
}

export type RejectReason = "too-small" | "mostly-blank" | "flat-overlay" | "no-detail";

export interface ShotVerdict {
  ok: boolean;
  reason?: RejectReason;
  metrics: ShotMetrics;
}

/**
 * Thresholds. Deliberately loose: the cost of rejecting a good screenshot is one slide
 * drawn as an illustration, and the cost of accepting a bad one is a broken post that a
 * human sees after it is published.
 */
export const THRESHOLDS = {
  /** A 1280×1600 JPEG of a real page is >100 KB; a blank one lands near 20 KB. */
  minBytes: 25_000,
  maxNearWhite: 0.85,
  maxDominant: 0.92,
  /**
   * Low on purpose. A real capture of opencode.ai — black, white and one grey — comes
   * back with 9 buckets, and dev-tool sites are exactly the population this feature
   * photographs, so a stricter floor rejects the good monochrome ones. Blank and flat
   * pages are already caught above; this only has to catch a 1-3 bucket gradient that
   * happens to be neither white nor uniform enough for the other two rules.
   */
  minDistinctBuckets: 4,
};

/** Pure decision, so the thresholds can be tested without a browser. */
export function judgeShot(m: ShotMetrics): ShotVerdict {
  if (m.bytes < THRESHOLDS.minBytes) return { ok: false, reason: "too-small", metrics: m };
  if (m.nearWhitePct > THRESHOLDS.maxNearWhite) return { ok: false, reason: "mostly-blank", metrics: m };
  if (m.dominantPct > THRESHOLDS.maxDominant) return { ok: false, reason: "flat-overlay", metrics: m };
  if (m.distinctBuckets < THRESHOLDS.minDistinctBuckets) return { ok: false, reason: "no-detail", metrics: m };
  return { ok: true, metrics: m };
}

/**
 * Read the pixels back.
 *
 * Decoding happens inside the same Chromium that took the shot — a canvas is a JPEG
 * decoder that is already installed, and adding a native image library to the image the
 * Playwright base pins would be a second thing to keep in step with it.
 *
 * Passed to the page as source text rather than as a function: tsx compiles named
 * functions with an esbuild `__name` helper that does not exist in the page realm.
 */
/**
 * Read the pixels back.
 *
 * Decoding happens inside the same Chromium that took the shot — a canvas is a JPEG
 * decoder that is already installed, and adding a native image library would be one more
 * thing to keep in step with the version the Playwright base image pins.
 *
 * The image is put into the page as an <img> and the sampler is a plain expression with
 * no arguments, because `page.evaluate` given a function as SOURCE TEXT evaluates it as
 * an expression and hands back the function object rather than calling it — the metrics
 * come back `undefined` and every shot then looks like a 0% white, 0-bucket image.
 */
const SAMPLE = `(async () => {
  const img = document.getElementById("shot");
  await img.decode();
  const W = 160, H = 200;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const total = W * H;
  let white = 0;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 244 && g > 244 && b > 244) white++;
    const key = (r >> 3) + "," + (g >> 3) + "," + (b >> 3);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let top = 0, distinct = 0;
  buckets.forEach((n) => {
    if (n > top) top = n;
    if (n / total >= 0.005) distinct++;
  });
  return { nearWhitePct: white / total, dominantPct: top / total, distinctBuckets: distinct };
})()`;

export async function analyzeShot(browser: Browser, buffer: Buffer): Promise<ShotMetrics> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    // A blank document holding nothing but the shot, so the analysis cannot be
    // influenced by whatever the captured page happened to leave behind.
    await page.setContent(`<body style="margin:0"><img id="shot" src="${dataUrl}"></body>`);
    const sampled = await page.evaluate<{
      nearWhitePct: number;
      dominantPct: number;
      distinctBuckets: number;
    }>(SAMPLE);
    return { bytes: buffer.byteLength, ...sampled };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function validateEvidenceShot(browser: Browser, buffer: Buffer): Promise<ShotVerdict> {
  // A file too small to be a page does not need decoding, and may not decode at all.
  if (buffer.byteLength < THRESHOLDS.minBytes) {
    return {
      ok: false,
      reason: "too-small",
      metrics: { bytes: buffer.byteLength, nearWhitePct: 1, dominantPct: 1, distinctBuckets: 0 },
    };
  }
  const metrics = await analyzeShot(browser, buffer);
  return judgeShot(metrics);
}
