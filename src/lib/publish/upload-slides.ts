import { uploadImage } from "./cloudinary";

/**
 * Give a freshly captured deck permanent URLs, immediately.
 *
 * Capture is the most expensive step in the pipeline — a Chromium context, a full
 * page render and one screenshot per slide, bounded to two at a time on the VPS.
 * The images used to leave here as base64 and become `URL.createObjectURL()` blobs
 * in the browser, which do not survive a refresh; the wizard then re-ran the whole
 * capture to get them back. Uploading here costs a few seconds of network that the
 * publish step was already paying, and buys a refresh that costs nothing.
 */

/** Cloudinary is fine with parallel uploads; this only stops a 10-slide deck opening 10 sockets at once. */
const MAX_PARALLEL = 4;

export interface UploadedSlides {
  urls: string[];
  /** Set when one or more slides could not be uploaded; `urls` is empty in that case. */
  error?: string;
}

/**
 * Upload every slide, or none.
 *
 * A partial list is worse than an empty one: the caller would persist it, a later
 * publish would post a deck with slides missing, and nothing would have failed
 * loudly. Capture itself still succeeds — the base64 goes back either way — so a
 * Cloudinary outage degrades to the old behaviour instead of losing the render.
 */
export async function uploadSlides(images: string[]): Promise<UploadedSlides> {
  if (images.length === 0) return { urls: [] };
  if (!process.env.CLOUDINARY_URL) {
    return { urls: [], error: "CLOUDINARY_URL is not configured" };
  }

  const urls = new Array<string>(images.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (let i = next++; i < images.length; i = next++) {
      urls[i] = await uploadImage(images[i]);
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, images.length) }, worker)
    );
    return { urls };
  } catch (err) {
    return { urls: [], error: err instanceof Error ? err.message : String(err) };
  }
}
