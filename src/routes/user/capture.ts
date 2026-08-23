import { Hono } from "hono";
import { captureQueue } from "../../services/capture-queue";
import { uploadSlides } from "../../lib/publish/upload-slides";
import { getCarousel, updateCarousel } from "../../lib/history/repo";

const app = new Hono<{ Variables: { session: any } }>();

/**
 * Render a deck to images and give them somewhere to live.
 *
 * The upload is part of this call rather than of publishing, because capture is the
 * expensive half and a browser refresh used to throw the result away: the images came
 * back as base64, became object URLs, and vanished, so the wizard re-ran the whole
 * capture. Uploading here moves work the publish step was doing anyway, and makes the
 * result survive.
 *
 * The base64 is still returned. The wizard downloads JPEGs straight from it, and a
 * Cloudinary failure then degrades to exactly the old behaviour instead of throwing
 * away a render that cost a Chromium context and one screenshot per slide.
 */
app.post("/", async (c) => {
  const { html, opts, carouselId } = (await c.req.json()) as {
    html: string;
    opts?: { pixelRatio?: number; quality?: number };
    /** When set, the uploaded URLs are written straight onto this row. */
    carouselId?: string;
  };

  if (!html?.trim()) {
    return c.json({ error: "Missing html content" }, 400);
  }

  try {
    const images = await captureQueue.capture(async (browser) => {
      // Re-use logic similar to captureCarouselServer, wrapped inside the queue.
      // But instead of importing/exporting a separate playwright instance,
      // we use the browser instance passed by our queue callback!
      const pixelRatio = opts?.pixelRatio ?? 2;
      const quality = opts?.quality ?? 92;
      const SLIDE_W = 1080;
      const SLIDE_H = 1350;
      const READY_TIMEOUT_MS = 6000;

      const context = await browser.newContext({
        viewport: { width: SLIDE_W, height: SLIDE_H },
        deviceScaleFactor: pixelRatio,
      });

      try {
        const page = await context.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });

        try {
          await Promise.race([
            page.evaluate(() => document.fonts.ready),
            new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
          ]);
        } catch (e) {
          console.warn("Waiting for fonts timed out or failed:", e);
        }

        await page.waitForTimeout(500);

        const sections = await page.$$("section");
        if (sections.length === 0) {
          throw new Error("No slide <section> elements found to export");
        }

        const buffers: string[] = [];
        for (const section of sections) {
          const buffer = await section.screenshot({
            type: "jpeg",
            quality,
          });
          buffers.push(buffer.toString("base64"));
        }
        return buffers;
      } finally {
        await context.close();
      }
    });

    const { urls, error: uploadError } = await uploadSlides(images);
    if (uploadError) {
      // Not fatal: the caller still has the render. Logged so a persistent
      // Cloudinary problem is visible rather than showing up later as a
      // publish that has to upload from scratch.
      console.error("Slide upload after capture failed:", uploadError);
    }

    // Persist against the row when the caller already has one. A re-export of an
    // existing carousel must not leave the previous run's URLs on it.
    if (carouselId && urls.length > 0) {
      const session = c.get("session") as { user: { id: string } };
      const owned = await getCarousel(carouselId, session.user.id);
      if (owned) {
        await updateCarousel(carouselId, { imageUrls: urls, status: "exported" });
      }
    }

    return c.json({ images, urls, uploadError });
  } catch (err: any) {
    console.error("Capture slides error:", err);
    return c.json({ error: err.message || "Failed to capture slides" }, 500);
  }
});

export default app;
