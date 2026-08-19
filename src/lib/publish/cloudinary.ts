import { v2 as cloudinary } from "cloudinary";

/**
 * Uploads a base64-encoded image to Cloudinary in the "vourdev-carousels" folder.
 * Returns the secure URL of the uploaded image.
 */
export async function uploadImage(base64Data: string): Promise<string> {
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL environment variable is not configured");
  }

  const uploadStr = base64Data.startsWith("data:")
    ? base64Data
    : `data:image/jpeg;base64,${base64Data}`;

  const response = await cloudinary.uploader.upload(uploadStr, {
    folder: "vourdev-carousels",
    resource_type: "image",
  });

  return response.secure_url;
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
