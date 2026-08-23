import { createHash } from "node:crypto";
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

/**
 * Attempts per slide, including the first.
 *
 * Four rather than three because an attempt is cheap now: uploadImage caps a single try
 * at 20 seconds, where the SDK default let a stalled connection hang for 108. The whole
 * budget is smaller than three attempts used to be, and a link this lossy needs the extra
 * roll of the dice more than it needs the shorter ceiling.
 */
const UPLOAD_ATTEMPTS = 4;
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
  /** Content hash per slide, positionally parallel to `urls`. Empty when the upload failed. */
  hashes: string[];
  /** Set when one or more slides could not be uploaded; `urls` is empty in that case. */
  error?: string;
}

/** What the carousel row already holds, so an unchanged slide is not sent again. */
export interface PreviousUpload {
  urls: string[];
  hashes: string[];
}

/** Identity of a slide is its bytes. Same pixels, same asset — no reason to send it twice. */
export function slideHash(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}

/**
 * URLs from a previous export that this one no longer references.
 *
 * These are the assets a re-export used to abandon in Cloudinary: the row was overwritten
 * with the new URLs and nothing ever deleted the old ones, so three exports of one deck
 * left two full sets behind forever.
 */
export function orphanedUrls(previous: PreviousUpload, keptUrls: string[]): string[] {
  const kept = new Set(keptUrls);
  return previous.urls.filter((u) => u && !kept.has(u));
}

/**
 * Upload every slide, or none.
 *
 * A partial list is worse than an empty one: the caller would persist it, a later
 * publish would post a deck with slides missing, and nothing would have failed
 * loudly. Capture itself still succeeds — the base64 goes back either way — so a
 * Cloudinary outage degrades to the old behaviour instead of losing the render.
 */
export async function uploadSlides(
  images: string[],
  previous: PreviousUpload = { urls: [], hashes: [] }
): Promise<UploadedSlides> {
  if (images.length === 0) return { urls: [], hashes: [] };
  if (!process.env.CLOUDINARY_URL) {
    return { urls: [], hashes: [], error: "CLOUDINARY_URL is not configured" };
  }

  const hashes = images.map(slideHash);

  // Matched by content, not by position: revising slide 2 shifts nothing, but reordering
  // the deck would, and an index-based lookup would then re-upload every slide after the
  // move for no reason.
  const known = new Map<string, string>();
  previous.hashes.forEach((h, i) => {
    const url = previous.urls[i];
    if (h && url) known.set(h, url);
  });

  const urls = new Array<string>(images.length);
  const todo: number[] = [];
  hashes.forEach((h, i) => {
    const hit = known.get(h);
    if (hit) urls[i] = hit;
    else todo.push(i);
  });

  let next = 0;
  async function worker(): Promise<void> {
    for (let k = next++; k < todo.length; k = next++) {
      const i = todo[k];
      urls[i] = await uploadWithRetry(images[i], i);
    }
  }

  // "Why was that export slow" had no answer in any log: the render is timed, the upload
  // was not, and the upload is where the minutes go on this link. One line per deck.
  const startedAt = Date.now();
  const bytes = todo.reduce((n, i) => n + Math.floor((images[i].length * 3) / 4), 0);

  if (todo.length === 0) {
    console.log(`[upload-slides] ${images.length} slides unchanged, nothing to upload`);
    return { urls, hashes };
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(MAX_PARALLEL, todo.length) }, worker)
    );
    const reused = images.length - todo.length;
    console.log(
      `[upload-slides] ${todo.length}/${images.length} slides uploaded` +
        (reused ? `, ${reused} reused` : "") +
        `, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    );
    return { urls, hashes };
  } catch (err) {
    console.error(
      `[upload-slides] gave up after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    );
    return { urls: [], hashes: [], error: err instanceof Error ? err.message : String(err) };
  }
}
