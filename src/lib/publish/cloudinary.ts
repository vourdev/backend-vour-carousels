import { v2 as cloudinary } from "cloudinary";

/**
 * Legacy store. Nothing is written here any more — slides have been stored on this VPS's
 * own disk since 25 Aug 2026, because pushing them out took 85.9s for a 1.8 MB deck on
 * this uplink. What remains is the read-and-delete side, for the rows written before that
 * change: they hold Cloudinary URLs, and the decks they belong to are still cleaned up
 * from the History screen.
 *
 * How long one call may hang before we give it up. The SDK's default is 60 seconds, and a
 * stalled request on this link was measured taking 108 seconds to surface as
 * `499 Request Timeout` — nearly two minutes spent learning a connection was already dead.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The `public_id` Cloudinary knows an asset by, recovered from its delivery URL.
 *
 * The row stores URLs, not ids, and deleting needs the id. Everything between `/upload/`
 * and the filename is noise for this purpose: the version segment (`v1787477367`) and any
 * transformation segments (`c_limit,w_1280,h_1600`, which `toTikTokSafeUrl` inserts) are
 * addressing, not identity — the asset underneath is the same one. What remains is the
 * folder path plus the basename without its extension.
 *
 * Returns null rather than guessing for anything that is not a Cloudinary delivery URL,
 * because the caller's next move is a delete.
 */
export function publicIdFromUrl(url: string): string | null {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1 || !url.includes("res.cloudinary.com")) return null;

  const segments = url.slice(idx + marker.length).split("/").filter(Boolean);
  // A transformation segment is a comma-separated list of `k_v` pairs; a version segment
  // is `v` followed by digits. Neither can be part of a public id, and both always
  // precede it.
  while (
    segments.length > 1 &&
    (/^v\d+$/.test(segments[0]) || /^[a-z]+_[^/]*$/.test(segments[0]))
  ) {
    segments.shift();
  }
  if (segments.length === 0) return null;

  const path = segments.join("/");
  const dot = path.lastIndexOf(".");
  const id = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  return id || null;
}

/**
 * Delete one uploaded slide.
 *
 * Resolves either way. A cleanup that stops on the first asset Cloudinary has already
 * forgotten would leave the rest of the deck behind, and "it is not there" is the state
 * the caller wanted anyway. The boolean says whether Cloudinary reported removing
 * something, so a caller can report honestly rather than claim work it did not do.
 *
 * The delivery URL keeps working for a while after this returns. Deletion is immediate in
 * storage — the Admin API answers 404 straight away — but the CDN serves what it has
 * cached until `invalidate` propagates. Verified on the VPS: destroy said ok, the Admin
 * API said gone, and the URL still returned 200. So "did the delete work" cannot be
 * answered by fetching the URL, and a test that tries will report a failure that is not
 * one.
 */
export async function destroyImage(url: string): Promise<boolean> {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL environment variable is not configured");
  }
  const publicId = publicIdFromUrl(url);
  if (!publicId) return false;

  // `timeout` is honoured by the SDK's request layer for every call, but its published
  // types leave it off the destroy options. Dropping it instead would let a cleanup hang
  // for the SDK default on a link where a stalled socket is the normal case.
  const res = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
    timeout: REQUEST_TIMEOUT_MS,
  } as unknown as { resource_type: "image"; invalidate: boolean });
  return res?.result === "ok";
}

/**
 * Bound a legacy Cloudinary URL to TikTok's 2,073,600-pixel cap for photo posts.
 *
 * Only decks captured before 25 Aug 2026 need this. Those were rendered at pixel ratio 2
 * (2160x2700 = 5.83M px), well past the cap, so their delivery URL has to carry a
 * `c_limit` transform. Captures since then are 1080x1350 = 1.46M px and already under it,
 * and they are not Cloudinary URLs anyway — with no `/upload/` marker to find, this
 * returns them untouched, which is the right answer for both.
 */
export function toTikTokSafeUrl(url: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}c_limit,w_1280,h_1600/${url.slice(insertAt)}`;
}
