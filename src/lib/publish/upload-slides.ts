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

/** Attempts per slide, including the first. */
const UPLOAD_ATTEMPTS = 3;
const UPLOAD_RETRY_BASE_MS = 400;

/**
 * Retry an upload on ANY failure, unlike `withRetry` in lib/retry.
 *
 * That helper only retries errors it can prove are the network, which is right for a
 * database statement: SQLite rejects a bad query identically every time, so retrying
 * multiplies latency for nothing. An upload is the opposite case. The Cloudinary SDK
 * rejects a dropped connection with a plain object — `{ message: "socket hang up",
 * http_code: 499 }` — carrying no `code` and no `cause`, so `isTransientNetworkError`
 * reads it as permanent and gives up on the first lost packet. On this VPS's uplink
 * that is the common case, not the rare one, and the cost of being wrong is one
 * wasted POST against losing the whole deck.
 */
async function uploadWithRetry(image: string, slideIndex: number): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      return await uploadImage(image);
    } catch (err) {
      lastErr = err;
      if (attempt === UPLOAD_ATTEMPTS) break;
      console.warn(
        `[upload-slides] slide ${slideIndex} attempt ${attempt}/${UPLOAD_ATTEMPTS} failed:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, UPLOAD_RETRY_BASE_MS * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

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
      urls[i] = await uploadWithRetry(images[i], i);
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
