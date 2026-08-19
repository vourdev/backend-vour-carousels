import { Hono } from "hono";
import { captureQueue } from "../../services/capture-queue";

const app = new Hono();

app.post("/", async (c) => {
  const { html, opts } = await c.req.json() as {
    html: string;
    opts?: { pixelRatio?: number; quality?: number };
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

    return c.json({ images });
  } catch (err: any) {
    console.error("Capture slides error:", err);
    return c.json({ error: err.message || "Failed to capture slides" }, 500);
  }
});

export default app;
