import { destroyImage } from "../publish/cloudinary";
import { getCarousel, listCarousels, updateCarousel, type Carousel } from "./repo";

/**
 * Free the Cloudinary assets a finished deck no longer needs.
 *
 * Slides accumulate: every export uploads a set, every re-export used to abandon the
 * previous one, and nothing ever deleted anything. A deck that has already been posted is
 * the clearest case — Instagram and TikTok hold their own copies from the moment Buffer
 * publishes, so the originals are dead weight — but the operator is the one who decides,
 * from the calendar, which decks are done with.
 */

/** Why a deck cannot be cleaned right now. Null means it can. */
export function cleanupBlockedReason(c: Carousel): string | null {
  if (c.status === "scheduled") {
    // Buffer fetches the asset when the post goes out, not when it was scheduled. Deleting
    // now would publish a hole, and the failure would surface hours later on the account.
    return "Deck ini masih terjadwal. Buffer mengambil gambarnya saat posting, jadi asetnya belum boleh dihapus.";
  }
  if (c.imageUrls.length === 0) return "Tidak ada gambar tersimpan untuk deck ini.";
  return null;
}

/**
 * The one asset worth keeping: whatever the calendar draws as this deck's thumbnail.
 *
 * The thumbnail is usually `imageUrls[0]`, so deleting the whole set would leave the
 * History grid full of broken tiles for content the operator still wants to look back on.
 * Keeping one slide of eight still frees most of it. When the thumbnail is not one of the
 * slides — an inline base64 fallback from a run where the upload failed — nothing needs
 * keeping and the whole set goes.
 */
function assetToKeep(c: Carousel): string | null {
  if (!c.thumbnail) return null;
  return c.imageUrls.includes(c.thumbnail) ? c.thumbnail : null;
}

export interface CleanupResult {
  carouselId: string;
  deleted: number;
  /** Assets Cloudinary had already forgotten, or that could not be parsed. */
  missed: number;
  kept: number;
}

/**
 * Delete a deck's slides, keeping its thumbnail.
 *
 * The row is updated to whatever survived, so a second run is a no-op rather than a second
 * round of delete calls against ids that are already gone.
 */
export async function cleanupCarouselImages(
  id: string,
  userId: string
): Promise<CleanupResult | { error: string }> {
  const c = await getCarousel(id, userId);
  if (!c) return { error: "Carousel not found" };

  const blocked = cleanupBlockedReason(c);
  if (blocked) return { error: blocked };

  const keep = assetToKeep(c);
  const doomed = c.imageUrls.filter((u) => u !== keep);

  // Sequential rather than parallel: this runs on a link where four concurrent uploads
  // already contend, and a cleanup is never the thing the operator is waiting on.
  let deleted = 0;
  for (const url of doomed) {
    const ok = await destroyImage(url).catch(() => false);
    if (ok) deleted++;
  }

  const keptUrls = keep ? [keep] : [];
  const keptHashes = keep
    ? [c.imageHashes[c.imageUrls.indexOf(keep)] ?? ""].filter(Boolean)
    : [];
  await updateCarousel(c.id, { imageUrls: keptUrls, imageHashes: keptHashes });

  console.log(
    `[cleanup] ${c.id}: deleted ${deleted}/${doomed.length}, kept ${keptUrls.length}`
  );
  return { carouselId: c.id, deleted, missed: doomed.length - deleted, kept: keptUrls.length };
}

/**
 * Clean every deck that has already been posted.
 *
 * Scoped to `posted` on purpose: those are unambiguously finished, and a bulk action that
 * could also touch drafts would be one misclick away from deleting work in progress. A
 * deck in any other state has to be cleaned individually, where the operator sees which
 * one they are acting on.
 */
export async function cleanupPostedCarousels(
  userId: string,
  limit = 200
): Promise<{ results: CleanupResult[]; deleted: number }> {
  const all = await listCarousels(userId, limit);
  const done = all.filter((c) => c.status === "posted" && c.imageUrls.length > 0);

  const results: CleanupResult[] = [];
  for (const c of done) {
    const r = await cleanupCarouselImages(c.id, userId);
    if ("carouselId" in r) results.push(r);
  }
  return { results, deleted: results.reduce((n, r) => n + r.deleted, 0) };
}
