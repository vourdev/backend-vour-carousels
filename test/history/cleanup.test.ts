import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Carousel } from "@/lib/history/repo";

/**
 * Cleanup deletes real assets. The rules that stop it deleting the wrong ones are the
 * whole point of the feature, so they are tested rather than trusted.
 */

const destroyImage = vi.fn();
const getCarousel = vi.fn();
const listCarousels = vi.fn();
const updateCarousel = vi.fn();

vi.mock("@/lib/publish/cloudinary", () => ({
  destroyImage: (...a: unknown[]) => destroyImage(...a),
}));
vi.mock("@/lib/history/repo", () => ({
  getCarousel: (...a: unknown[]) => getCarousel(...a),
  listCarousels: (...a: unknown[]) => listCarousels(...a),
  updateCarousel: (...a: unknown[]) => updateCarousel(...a),
}));

const URLS = [
  "https://res.cloudinary.com/c/image/upload/v1/vourdev-carousels/s0.jpg",
  "https://res.cloudinary.com/c/image/upload/v1/vourdev-carousels/s1.jpg",
  "https://res.cloudinary.com/c/image/upload/v1/vourdev-carousels/s2.jpg",
];

function carousel(over: Partial<Carousel> = {}): Carousel {
  return {
    id: "c1",
    userId: "u1",
    source: "ai",
    title: "t",
    caption: "",
    hashtags: [],
    slideCount: 3,
    status: "posted",
    model: null,
    thumbnail: URLS[0],
    bufferIgId: null,
    bufferTtId: null,
    dueAt: null,
    createdAt: 1,
    updatedAt: 1,
    imageUrls: [...URLS],
    imageHashes: ["h0", "h1", "h2"],
    slidePlan: null,
    ...over,
  } as Carousel;
}

beforeEach(() => {
  vi.clearAllMocks();
  destroyImage.mockResolvedValue(true);
  updateCarousel.mockResolvedValue(undefined);
});

describe("cleanupBlockedReason", () => {
  it("refuses a scheduled deck", async () => {
    const { cleanupBlockedReason } = await import("@/lib/history/cleanup");
    // Buffer fetches the asset when the post goes out. Deleting now publishes a hole, and
    // the failure surfaces hours later on the live account.
    expect(cleanupBlockedReason(carousel({ status: "scheduled" }))).toMatch(/terjadwal/i);
  });

  it("allows a posted deck", async () => {
    const { cleanupBlockedReason } = await import("@/lib/history/cleanup");
    expect(cleanupBlockedReason(carousel({ status: "posted" }))).toBeNull();
  });

  it("allows an exported or failed deck", async () => {
    const { cleanupBlockedReason } = await import("@/lib/history/cleanup");
    expect(cleanupBlockedReason(carousel({ status: "exported" }))).toBeNull();
    expect(cleanupBlockedReason(carousel({ status: "failed" }))).toBeNull();
  });

  it("says so when there is nothing stored", async () => {
    const { cleanupBlockedReason } = await import("@/lib/history/cleanup");
    expect(cleanupBlockedReason(carousel({ imageUrls: [] }))).toMatch(/tidak ada gambar/i);
  });
});

describe("cleanupCarouselImages", () => {
  it("deletes the slides but keeps the thumbnail", async () => {
    const { cleanupCarouselImages } = await import("@/lib/history/cleanup");
    getCarousel.mockResolvedValue(carousel());

    const res = await cleanupCarouselImages("c1", "u1");
    expect(res).toMatchObject({ deleted: 2, missed: 0, kept: 1 });
    // The calendar draws this deck from its thumbnail; deleting it leaves a broken tile
    // for content the operator still wants to look back on.
    expect(destroyImage).toHaveBeenCalledTimes(2);
    expect(destroyImage).not.toHaveBeenCalledWith(URLS[0]);
    expect(updateCarousel).toHaveBeenCalledWith("c1", {
      imageUrls: [URLS[0]],
      imageHashes: ["h0"],
    });
  });

  it("deletes everything when the thumbnail is not one of the slides", async () => {
    const { cleanupCarouselImages } = await import("@/lib/history/cleanup");
    // An inline base64 fallback, from a run where the upload failed.
    getCarousel.mockResolvedValue(carousel({ thumbnail: "data:image/jpeg;base64,AAA" }));

    const res = await cleanupCarouselImages("c1", "u1");
    expect(res).toMatchObject({ deleted: 3, kept: 0 });
    expect(updateCarousel).toHaveBeenCalledWith("c1", { imageUrls: [], imageHashes: [] });
  });

  it("refuses a scheduled deck without deleting anything", async () => {
    const { cleanupCarouselImages } = await import("@/lib/history/cleanup");
    getCarousel.mockResolvedValue(carousel({ status: "scheduled" }));

    const res = await cleanupCarouselImages("c1", "u1");
    expect(res).toHaveProperty("error");
    expect(destroyImage).not.toHaveBeenCalled();
    expect(updateCarousel).not.toHaveBeenCalled();
  });

  it("does not reach another session's deck", async () => {
    const { cleanupCarouselImages } = await import("@/lib/history/cleanup");
    getCarousel.mockResolvedValue(null); // repo scopes by owner
    expect(await cleanupCarouselImages("c1", "someone-else")).toEqual({
      error: "Carousel not found",
    });
    expect(destroyImage).not.toHaveBeenCalled();
  });

  it("still records the row when Cloudinary had already forgotten an asset", async () => {
    const { cleanupCarouselImages } = await import("@/lib/history/cleanup");
    getCarousel.mockResolvedValue(carousel());
    destroyImage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const res = await cleanupCarouselImages("c1", "u1");
    // Reported honestly rather than counted as deleted, but the row is still updated so a
    // second run is a no-op instead of another round of calls against ids that are gone.
    expect(res).toMatchObject({ deleted: 1, missed: 1 });
    expect(updateCarousel).toHaveBeenCalled();
  });

  it("survives a delete that throws", async () => {
    const { cleanupCarouselImages } = await import("@/lib/history/cleanup");
    getCarousel.mockResolvedValue(carousel());
    destroyImage.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue(true);

    const res = await cleanupCarouselImages("c1", "u1");
    expect(res).toMatchObject({ deleted: 1, missed: 1 });
  });
});

describe("cleanupPostedCarousels", () => {
  it("touches posted decks only", async () => {
    const { cleanupPostedCarousels } = await import("@/lib/history/cleanup");
    const posted = carousel({ id: "posted-1", status: "posted" });
    const scheduled = carousel({ id: "sched-1", status: "scheduled" });
    const draft = carousel({ id: "draft-1", status: "exported" });
    listCarousels.mockResolvedValue([posted, scheduled, draft]);
    getCarousel.mockImplementation(async (id: string) =>
      [posted, scheduled, draft].find((c) => c.id === id) ?? null
    );

    const res = await cleanupPostedCarousels("u1");
    expect(res.results.map((r) => r.carouselId)).toEqual(["posted-1"]);
    // A bulk action that could reach a draft is one misclick from deleting work in progress.
    expect(updateCarousel).toHaveBeenCalledTimes(1);
    expect(updateCarousel).toHaveBeenCalledWith("posted-1", expect.anything());
  });

  it("skips posted decks that hold nothing", async () => {
    const { cleanupPostedCarousels } = await import("@/lib/history/cleanup");
    listCarousels.mockResolvedValue([carousel({ status: "posted", imageUrls: [] })]);

    const res = await cleanupPostedCarousels("u1");
    expect(res).toEqual({ results: [], deleted: 0 });
    expect(destroyImage).not.toHaveBeenCalled();
  });
});
