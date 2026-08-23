import { Hono } from "hono";
import { captureQueue } from "../../services/capture-queue";
import {
  createCaptureJob,
  failCaptureJob,
  finishCaptureJob,
  readCaptureJob,
  type CaptureSuccess,
} from "../../services/capture-jobs";
import { orphanedUrls, uploadSlides } from "../../lib/publish/upload-slides";
import { destroyImage } from "../../lib/publish/cloudinary";
import { getCarousel, updateCarousel } from "../../lib/history/repo";
import { assembleCarousel } from "../../lib/ds/assemble";
import { warmUpIllustrations } from "../../lib/ds/illustrations.server";
import type { SlidePlan } from "../../lib/ds/schema";

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
 * The base64 comes back ONLY when the upload failed. On the happy path the response is
 * a handful of URLs instead of ~2.4 MB of base64 that had to cross the VPS uplink,
 * Cloudflare and Vercel to reach a browser that immediately turned it into blobs and
 * threw it away on the next reload. On the failure path it is still returned, so a
 * Cloudinary outage degrades to exactly the old behaviour rather than losing a render
 * that cost a Chromium context and one screenshot per slide.
 */
async function runCapture(
  html: string,
  opts: { pixelRatio?: number; quality?: number } | undefined,
  carouselId: string | undefined,
  userId: string
): Promise<CaptureSuccess> {
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

  // The one line worth logging in this service: a Chromium context plus one
  // screenshot per slide is the most expensive thing it does, and "why is the VPS
  // busy" used to have no answer in any log.
  console.log(`[capture] rendered ${images.length} slides${carouselId ? ` for ${carouselId}` : ""}`);

  // What this deck already has on Cloudinary, so a revision does not pay for the slides
  // it did not touch. Reading it is one row; getting it wrong only costs a re-upload.
  const owned = carouselId ? await getCarousel(carouselId, userId) : null;
  const previous = owned
    ? { urls: owned.imageUrls, hashes: owned.imageHashes }
    : { urls: [], hashes: [] };

  const { urls, hashes, error: uploadError } = await uploadSlides(images, previous);
  if (uploadError) {
    // Not fatal: the caller still has the render. Logged so a persistent
    // Cloudinary problem is visible rather than showing up later as a
    // publish that has to upload from scratch.
    console.error("Slide upload after capture failed:", uploadError);
  }

  // Persist against the row when the caller already has one. A re-export of an
  // existing carousel must not leave the previous run's URLs on it.
  if (owned && urls.length > 0) {
    await updateCarousel(owned.id, { imageUrls: urls, imageHashes: hashes, status: "exported" });

    // The slides this export replaced. Left alone they stayed in Cloudinary forever —
    // three exports of one deck meant two abandoned sets. Deliberately skipped once the
    // deck is scheduled or posted: Buffer fetches the asset at post time, so deleting
    // what a pending post still points at would publish a hole.
    if (owned.status !== "scheduled" && owned.status !== "posted") {
      const stale = orphanedUrls(previous, urls);
      if (stale.length > 0) {
        const removed = await Promise.all(
          stale.map((u) => destroyImage(u).catch(() => false))
        );
        console.log(
          `[capture] cleaned ${removed.filter(Boolean).length}/${stale.length} replaced slides`
        );
      }
    }
  }

  // Sending both would put a multi-megabyte array inside the response object for no
  // reason: with URLs in hand the client never touches the base64.
  return urls.length > 0 ? { urls, images: [] } : { urls: [], images, uploadError };
}

/**
 * Start a capture and answer immediately.
 *
 * This used to render, upload and reply on one connection. That connection lived as long
 * as the work did — 269 seconds for a five-slide deck on this uplink — and Cloudflare
 * closes an origin connection at 100 seconds with a 524, which surfaced in the browser as
 * `Backend returned error 524` after the render had already succeeded and the slides were
 * already on Cloudinary. The work is unchanged; only its relationship to the request is.
 */
app.post("/", async (c) => {
  const { plan, html: rawHtml, opts, carouselId } = (await c.req.json()) as {
    /** Preferred. The deck is assembled here rather than shipped in. */
    plan?: SlidePlan;
    /** Still accepted for callers that hold HTML and no plan. */
    html?: string;
    opts?: { pixelRatio?: number; quality?: number };
    /** When set, the uploaded URLs are written straight onto this row. */
    carouselId?: string;
  };

  // A deck is ~1.1 MB of inline fonts and SVG. It used to be assembled here, returned
  // to the browser for the preview, and then posted back here to be captured — two full
  // trips across a degraded uplink per export, for bytes this service produced itself.
  // Next also refuses to encode a string that size as a Server Action argument
  // ("Maximum array nesting exceeded"), so the round trip was not merely wasteful.
  let html = rawHtml;
  if (!html && plan) {
    await warmUpIllustrations();
    html = assembleCarousel(plan);
  }

  if (!html?.trim()) {
    return c.json({ error: "Missing plan or html content" }, 400);
  }

  const session = c.get("session") as { user: { id: string } };
  const jobId = createCaptureJob(session.user.id);

  // Deliberately not awaited: the point is that the response does not wait on the work.
  // Every path inside settles the job, so a poller always gets an answer rather than
  // sitting on "pending" forever.
  void runCapture(html, opts, carouselId, session.user.id)
    .then((result) => finishCaptureJob(jobId, result))
    .catch((err: any) => {
      console.error("Capture slides error:", err);
      failCaptureJob(jobId, err?.message || "Failed to capture slides");
    });

  return c.json({ jobId }, 202);
});

/**
 * Poll a capture.
 *
 * `unknown` covers a swept job and a restarted process alike, because the client should
 * do the same thing about both — read the carousel row, or export again.
 */
app.get("/:jobId", (c) => {
  const session = c.get("session") as { user: { id: string } };
  const job = readCaptureJob(c.req.param("jobId"), session.user.id);
  if (!job) return c.json({ status: "unknown" }, 404);

  if (job.status === "done") {
    return c.json({
      status: "done",
      urls: job.urls,
      images: job.images,
      uploadError: job.uploadError,
    });
  }
  if (job.status === "error") return c.json({ status: "error", error: job.error });
  return c.json({ status: "pending" });
});

export default app;
