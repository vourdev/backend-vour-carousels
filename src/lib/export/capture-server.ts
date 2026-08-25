import {
  READY_TIMEOUT_MS,
  SLIDE_H,
  SLIDE_PIXEL_RATIO,
  SLIDE_QUALITY,
  SLIDE_W,
} from "./slide-format";

/**
 * Render an assembled carousel HTML string in a headless Chromium browser
 * and take a screenshot of each <section> (slide) at 1080x1350 resolution.
 * Returns an array of Buffers containing the JPEG images.
 */
export async function captureCarouselServer(
  html: string,
  opts: { pixelRatio?: number; quality?: number } = {}
): Promise<Buffer[]> {
  const { chromium } = await import("playwright");
  const pixelRatio = opts.pixelRatio ?? SLIDE_PIXEL_RATIO;
  const quality = opts.quality ?? SLIDE_QUALITY;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: SLIDE_W, height: SLIDE_H },
      deviceScaleFactor: pixelRatio,
    });
    
    const page = await context.newPage();
    
    // Set the HTML content and wait until network is idle
    await page.setContent(html, { waitUntil: "networkidle" });
    
    // Wait for fonts to be ready or timeout
    try {
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
      ]);
    } catch (e) {
      console.warn("Waiting for fonts timed out or failed:", e);
    }

    // A small settle timeout for layout/rendering
    await page.waitForTimeout(500);

    const sections = await page.$$("section");
    if (sections.length === 0) {
      throw new Error("No slide <section> elements found to export");
    }

    const buffers: Buffer[] = [];
    for (const section of sections) {
      const buffer = await section.screenshot({
        type: "jpeg",
        quality,
      });
      buffers.push(buffer);
    }
    return buffers;
  } finally {
    await browser.close();
  }
}
