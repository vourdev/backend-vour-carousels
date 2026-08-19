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
