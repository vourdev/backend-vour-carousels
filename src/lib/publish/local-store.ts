import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Slides live on this VPS's own disk and are served by nginx behind Cloudflare.
 *
 * They used to be pushed to Cloudinary, which meant every deck shipped its bytes out
 * over the one direction of this uplink that is broken. Measured 25 Aug 2026: a 1.8 MB
 * deck took 85.9s and logged six `499 Request Timeout` retries on the way, and the
 * generation request could not return until it finished. Writing the same bytes to a
 * local file takes microseconds, so the upload simply leaves the critical path.
 *
 * The bytes still have to reach Instagram eventually, but as a *pull* rather than a
 * push: Buffer fetches the URL, Cloudflare serves it, and only a cache miss ever
 * touches the bad link — once, for the whole internet. Measured on the same day, same
 * 300 KB payload: 0.54s cold through Cloudflare, 0.24s cached, against roughly 14s to
 * push one slide to Cloudinary.
 */

/** Where the files land. A bind mount in production; a temp dir under test. */
export function slideDir(): string {
  return process.env.SLIDE_STORE_DIR ?? "/data/slides";
}

/** What the outside world calls them. No trailing slash. */
export function publicBase(): string {
  return (process.env.PUBLIC_SLIDE_BASE ?? "https://cdn.vour.dev/slides").replace(/\/+$/, "");
}

/**
 * The file name is the content hash, which makes every URL immutable by construction:
 * the same pixels always produce the same name, and a name never points at different
 * pixels. That is what lets nginx serve these with `immutable` and a one-year max-age,
 * and it means re-exporting an unchanged deck rewrites nothing.
 */
export function slideUrl(hash: string): string {
  return `${publicBase()}/${hash}.jpg`;
}

const HASH_RE = /^[a-f0-9]{64}$/;

/** True for URLs this module owns. Legacy Cloudinary URLs must keep their old delete path. */
export function isLocalSlideUrl(url: string): boolean {
  return url.startsWith(`${publicBase()}/`) && HASH_RE.test(hashFromUrl(url) ?? "");
}

export function hashFromUrl(url: string): string | null {
  const name = url.split("/").pop() ?? "";
  const hash = name.endsWith(".jpg") ? name.slice(0, -4) : "";
  return HASH_RE.test(hash) ? hash : null;
}

function decode(base64Data: string): Buffer {
  return base64Data.startsWith("data:")
    ? Buffer.from(base64Data.slice(base64Data.indexOf(",") + 1), "base64")
    : Buffer.from(base64Data, "base64");
}

/**
 * Write one slide and return its public URL.
 *
 * Written to a temporary name and renamed into place, which is atomic on one filesystem.
 * nginx serves this directory directly and Cloudflare caches what it gets forever, so a
 * reader that caught a half-written file would pin a truncated JPEG at that URL for a
 * year. Rename means a reader sees either nothing or the whole image.
 *
 * An existing file is left alone rather than rewritten: the name is the hash of the
 * contents, so it already holds exactly these bytes.
 *
 * The temporary name carries a UUID rather than pid and timestamp. A deck may repeat a
 * slide, and two writes of identical bytes are two calls with the same hash running
 * concurrently — same pid, same millisecond, so the "unique" name collided, the first
 * rename moved the file away and the second failed with ENOENT. Since the contract is
 * all-or-nothing, that lost the whole deck.
 */
export async function storeSlide(base64Data: string, hash: string): Promise<string> {
  const dir = slideDir();
  const target = join(dir, `${hash}.jpg`);

  if (await exists(target)) return slideUrl(hash);

  await mkdir(dir, { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, decode(base64Data));
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return slideUrl(hash);
}

/**
 * Delete one stored slide.
 *
 * Resolves false rather than throwing when the file is already gone — a cleanup run
 * over a deck that was partly cleaned before should finish the job, not stop on the
 * first name that no longer exists.
 */
export async function deleteSlide(url: string): Promise<boolean> {
  const hash = hashFromUrl(url);
  if (!hash) return false;
  try {
    await unlink(join(slideDir(), `${hash}.jpg`));
    return true;
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
