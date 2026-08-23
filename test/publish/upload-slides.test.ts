import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Capture is the most expensive step in the pipeline, and its output used to reach the
 * browser as base64 only — `URL.createObjectURL()` blobs that a refresh throws away, at
 * which point the wizard re-ran the whole capture. Uploading here is what makes the
 * result outlive the page.
 */

const uploadImage = vi.fn();
vi.mock("@/lib/publish/cloudinary", () => ({ uploadImage: (...a: unknown[]) => uploadImage(...a) }));

beforeEach(() => {
  uploadImage.mockReset();
  process.env.CLOUDINARY_URL = "cloudinary://key:secret@cloud";
});

describe("uploadSlides", () => {
  it("keeps slide order even though uploads run in parallel", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");
    // Earlier slides resolve last, so a naive push-as-you-go would reverse the deck.
    uploadImage.mockImplementation(
      (b64: string) =>
        new Promise((resolve) =>
          setTimeout(() => resolve(`https://cdn/${b64}.jpg`), (5 - Number(b64)) * 5)
        )
    );

    const { urls } = await uploadSlides(["0", "1", "2", "3", "4"]);
    expect(urls).toEqual([
      "https://cdn/0.jpg",
      "https://cdn/1.jpg",
      "https://cdn/2.jpg",
      "https://cdn/3.jpg",
      "https://cdn/4.jpg",
    ]);
  });

  it("uploads every slide exactly once", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");
    uploadImage.mockImplementation(async (b64: string) => `https://cdn/${b64}`);

    const { urls } = await uploadSlides(["a", "b", "c", "d", "e", "f", "g"]);
    expect(urls).toHaveLength(7);
    expect(uploadImage).toHaveBeenCalledTimes(7);
  });

  // A partial list is worse than none: it would be persisted, and a later publish would
  // post a deck with slides silently missing.
  it("returns nothing rather than a partial deck when one slide fails", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");
    uploadImage.mockImplementation(async (b64: string) => {
      if (b64 === "c") throw new Error("Cloudinary 500");
      return `https://cdn/${b64}`;
    });

    const res = await uploadSlides(["a", "b", "c", "d"]);
    expect(res.urls).toEqual([]);
    expect(res.error).toContain("Cloudinary 500");
  });

  /**
   * The whole deck used to be lost to one dropped packet.
   *
   * `uploadSlides` is all-or-nothing by design, so a single slide erroring empties the
   * result — and the wizard then advanced to step 4 holding object URLs, wrote a carousel
   * row with no imageUrls, and stranded the user there after a refresh. On this VPS's
   * uplink a lost connection is routine, so the first attempt has to not be the only one.
   */
  it("retries a slide that failed transiently instead of losing the deck", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");
    let cAttempts = 0;
    uploadImage.mockImplementation(async (b64: string) => {
      if (b64 === "c" && ++cAttempts === 1) {
        // The shape the Cloudinary SDK actually rejects with on a dropped connection:
        // a plain object with no `code` and no `cause`, which lib/retry reads as permanent.
        throw Object.assign(new Error("socket hang up"), { http_code: 499 });
      }
      return `https://cdn/${b64}`;
    });

    const res = await uploadSlides(["a", "b", "c", "d"]);
    expect(res.error).toBeUndefined();
    expect(res.urls).toEqual(["https://cdn/a", "https://cdn/b", "https://cdn/c", "https://cdn/d"]);
    expect(cAttempts).toBe(2);
  });

  it("gives up after a bounded number of attempts per slide", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");
    uploadImage.mockImplementation(async () => {
      throw new Error("socket hang up");
    });

    const res = await uploadSlides(["only"]);
    expect(res.urls).toEqual([]);
    expect(res.error).toContain("socket hang up");
    // Bounded: a retry loop with no ceiling would hold the request open indefinitely
    // while Chromium's output sits in memory waiting on it. Four attempts, because
    // uploadImage caps a single try at 20s — the whole budget is smaller than three
    // attempts were when a stalled connection could hang for 108 seconds.
    expect(uploadImage).toHaveBeenCalledTimes(4);
  });

  /**
   * A revision touches one or two slides of eight. Re-uploading the other six cost minutes
   * on this uplink and abandoned the previous run's assets in Cloudinary, where nothing
   * ever deleted them — three exports of one deck left two full sets behind.
   */
  describe("re-export", () => {
    it("uploads only the slides whose bytes changed", async () => {
      const { uploadSlides, slideHash } = await import("@/lib/publish/upload-slides");
      uploadImage.mockImplementation(async (b64: string) => `https://cdn/${b64}-new`);

      const first = await uploadSlides(["a", "b", "c"]);
      expect(uploadImage).toHaveBeenCalledTimes(3);
      uploadImage.mockClear();

      // Slide 1 revised; 0 and 2 are byte-identical.
      const second = await uploadSlides(["a", "B", "c"], first);
      expect(uploadImage).toHaveBeenCalledTimes(1);
      expect(uploadImage).toHaveBeenCalledWith("B");
      expect(second.urls[0]).toBe(first.urls[0]);
      expect(second.urls[2]).toBe(first.urls[2]);
      expect(second.urls[1]).not.toBe(first.urls[1]);
      expect(second.hashes[0]).toBe(slideHash("a"));
    });

    it("uploads nothing at all when the deck is unchanged", async () => {
      const { uploadSlides } = await import("@/lib/publish/upload-slides");
      uploadImage.mockImplementation(async (b64: string) => `https://cdn/${b64}`);

      const first = await uploadSlides(["a", "b"]);
      uploadImage.mockClear();

      const second = await uploadSlides(["a", "b"], first);
      expect(uploadImage).not.toHaveBeenCalled();
      expect(second.urls).toEqual(first.urls);
    });

    it("matches by content, so reordering the deck re-uploads nothing", async () => {
      const { uploadSlides } = await import("@/lib/publish/upload-slides");
      uploadImage.mockImplementation(async (b64: string) => `https://cdn/${b64}`);

      const first = await uploadSlides(["a", "b", "c"]);
      uploadImage.mockClear();

      // Index-based matching would consider all three changed and pay for the whole deck.
      const second = await uploadSlides(["c", "a", "b"], first);
      expect(uploadImage).not.toHaveBeenCalled();
      expect(second.urls).toEqual([first.urls[2], first.urls[0], first.urls[1]]);
    });

    it("ignores a previous entry whose url is missing", async () => {
      const { uploadSlides, slideHash } = await import("@/lib/publish/upload-slides");
      uploadImage.mockImplementation(async (b64: string) => `https://cdn/${b64}`);

      // A row written before the hashes existed, or a half-failed run.
      const second = await uploadSlides(["a"], { urls: [], hashes: [slideHash("a")] });
      expect(uploadImage).toHaveBeenCalledTimes(1);
      expect(second.urls).toEqual(["https://cdn/a"]);
    });
  });

  describe("orphanedUrls", () => {
    it("names exactly what the new export no longer points at", async () => {
      const { orphanedUrls } = await import("@/lib/publish/upload-slides");
      const previous = { urls: ["u0", "u1", "u2"], hashes: ["h0", "h1", "h2"] };
      expect(orphanedUrls(previous, ["u0", "NEW", "u2"])).toEqual(["u1"]);
    });

    it("is empty when everything was reused", async () => {
      const { orphanedUrls } = await import("@/lib/publish/upload-slides");
      const previous = { urls: ["u0", "u1"], hashes: ["h0", "h1"] };
      expect(orphanedUrls(previous, ["u1", "u0"])).toEqual([]);
    });
  });

  it("reports the missing configuration instead of throwing", async () => {
    delete process.env.CLOUDINARY_URL;
    const { uploadSlides } = await import("@/lib/publish/upload-slides");

    const res = await uploadSlides(["a"]);
    expect(res.urls).toEqual([]);
    expect(res.error).toMatch(/CLOUDINARY_URL/);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("does nothing for an empty deck", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");
    expect(await uploadSlides([])).toEqual({ urls: [], hashes: [] });
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
