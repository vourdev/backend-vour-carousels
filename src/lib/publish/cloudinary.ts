import { v2 as cloudinary } from "cloudinary";

/**
 * How long one attempt may hang before we give up on it and try again.
 *
 * The SDK's default is 60 seconds, and a stalled upload on this VPS's uplink was measured
 * taking 108 seconds to surface as `499 Request Timeout` — nearly two minutes spent
 * learning that a connection was already dead, before the retry could even start. A
 * healthy upload of a ~240 KB slide finishes in a couple of seconds, so anything past 20
 * is not slow, it is stuck: failing fast and reconnecting is strictly quicker than waiting
 * out a socket that is not coming back.
 */
const UPLOAD_TIMEOUT_MS = 20_000;

/**
 * Uploads a JPEG to Cloudinary in the "vourdev-carousels" folder.
 * Returns the secure URL of the uploaded image.
 *
 * The bytes go up as binary multipart rather than a `data:` URI. Base64 costs a third
 * more bytes for the same image, and on a link dropping a large share of its packets
 * every extra byte is another chance to stall — the encoding was buying nothing, since
 * the caller holds the JPEG either way.
 */
export async function uploadImage(base64Data: string): Promise<string> {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL environment variable is not configured");
  }

  const body = base64Data.startsWith("data:")
    ? Buffer.from(base64Data.slice(base64Data.indexOf(",") + 1), "base64")
    : Buffer.from(base64Data, "base64");

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "vourdev-carousels", resource_type: "image", timeout: UPLOAD_TIMEOUT_MS },
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url) return reject(new Error("Cloudinary returned no secure_url"));
        resolve(result.secure_url);
      }
    );
    stream.on("error", reject);
    stream.end(body);
  });
}

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
    timeout: UPLOAD_TIMEOUT_MS,
  } as unknown as { resource_type: "image"; invalidate: boolean });
  return res?.result === "ok";
}

/**
 * Returns an on-the-fly resized derivative of a Cloudinary URL, bounded to
 * stay under TikTok's 2,073,600 (1920x1080) pixel-count cap for photo posts.
 * Slides are captured at 1080x1350 (4:5) x2 pixel ratio (2160x2700 = 5.83M px)
 * for Instagram sharpness, which already exceeds that cap. c_limit only
 * downscales — never upscales or distorts — so this is a no-op for any
 * asset already under the bound.
 */
export function toTikTokSafeUrl(url: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}c_limit,w_1280,h_1600/${url.slice(insertAt)}`;
}
