import { destroyImage } from "./cloudinary";
import { deleteSlide, isLocalSlideUrl } from "./local-store";

/**
 * Delete one stored slide, wherever it lives.
 *
 * Slides moved from Cloudinary to this VPS's own disk on 25 Aug 2026, but the rows
 * written before that still hold Cloudinary URLs, and the decks they belong to are
 * still cleaned up from the History screen. Routing on the URL keeps both working
 * without a migration: a stored URL says which store owns it.
 */
export async function deleteAsset(url: string): Promise<boolean> {
  return isLocalSlideUrl(url) ? deleteSlide(url) : destroyImage(url);
}
