import { createHash } from "node:crypto";
import { slideUrl, storeSlide } from "./local-store";

/**
 * Give a freshly captured deck permanent URLs, immediately.
 *
 * Capture is the most expensive step in the pipeline — a Chromium context, a full
 * page render and one screenshot per slide, bounded to two at a time on the VPS.
 * The images used to leave here as base64 and become `URL.createObjectURL()` blobs
 * in the browser, which do not survive a refresh; the wizard then re-ran the whole
 * capture to get them back. Persisting here buys a refresh that costs nothing.
 *
 * This used to push every slide to Cloudinary, and that push was the slowest thing in
 * the pipeline — 85.9s for a 1.8 MB deck, six `499 Request Timeout` retries along the
 * way, all of it blocking the response. The machinery that surrounded it (four
 * concurrent uploads, four attempts each, a 20-second per-attempt ceiling) existed
 * purely to survive that link. Writing to local disk needs none of it: a failure here
 * is ENOSPC or EACCES, which is a real fault that retrying cannot fix.
 */

export interface UploadedSlides {
  urls: string[];
  /** Content hash per slide, positionally parallel to `urls`. Empty when the write failed. */
  hashes: string[];
  /** Set when one or more slides could not be stored; `urls` is empty in that case. */
  error?: string;
}

/** What the carousel row already holds, so a re-export can clean up what it replaced. */
export interface PreviousUpload {
  urls: string[];
  hashes: string[];
}

/** Identity of a slide is its bytes — and, since names are hashes, so is its URL. */
export function slideHash(base64: string): string {
  return createHash("sha256").update(base64).digest("hex");
}

/**
 * URLs from a previous export that this one no longer references.
 *
 * These are the assets a re-export used to abandon: the row was overwritten with the new
 * URLs and nothing ever deleted the old ones, so three exports of one deck left two full
 * sets behind forever.
 */
export function orphanedUrls(previous: PreviousUpload, keptUrls: string[]): string[] {
  const kept = new Set(keptUrls);
  return previous.urls.filter((u) => u && !kept.has(u));
}

/**
 * Store every slide, or none.
 *
 * A partial list is worse than an empty one: the caller would persist it, a later
 * publish would post a deck with slides missing, and nothing would have failed
 * loudly. Capture itself still succeeds — the base64 goes back either way — so a
 * storage fault degrades to the old in-memory behaviour instead of losing the render.
 */
export async function uploadSlides(images: string[]): Promise<UploadedSlides> {
  if (images.length === 0) return { urls: [], hashes: [] };

  const hashes = images.map(slideHash);
  // The URL follows from the hash alone, so it is known before anything is written and
  // is identical for a slide that has been stored before. Matching against the previous
  // export by position or by content is no longer a thing that has to be done.
  const urls = hashes.map(slideUrl);

  const startedAt = Date.now();
  const bytes = images.reduce((n, img) => n + Math.floor((img.length * 3) / 4), 0);

  try {
    await Promise.all(images.map((img, i) => storeSlide(img, hashes[i])));
    console.log(
      `[upload-slides] ${images.length} slides stored, ` +
        `${(bytes / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    );
    return { urls, hashes };
  } catch (err) {
    console.error(
      `[upload-slides] failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s:`,
      err instanceof Error ? err.message : err
    );
    return { urls: [], hashes: [], error: err instanceof Error ? err.message : String(err) };
  }
}
