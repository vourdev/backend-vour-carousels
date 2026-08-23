import { describe, it, expect, vi, beforeEach } from "vitest";
import { publicIdFromUrl, destroyImage, toTikTokSafeUrl } from "@/lib/publish/cloudinary";
import { v2 as cloudinary } from "cloudinary";

vi.mock("cloudinary", () => ({
  v2: { uploader: { upload_stream: vi.fn(), destroy: vi.fn() } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLOUDINARY_URL = "cloudinary://api_key:api_secret@cloud_name";
});

/**
 * The carousels row stores delivery URLs, not ids, and deleting needs the id. Getting
 * this wrong is not a no-op: a wrong id deletes the wrong asset, or silently deletes
 * nothing while the caller reports a cleanup that never happened.
 */
describe("publicIdFromUrl", () => {
  it("recovers the id from a real slide URL", () => {
    expect(
      publicIdFromUrl(
        "https://res.cloudinary.com/dggavcyco/image/upload/v1787477367/vourdev-carousels/oldfho2099oxvmk2mtvy.jpg"
      )
    ).toBe("vourdev-carousels/oldfho2099oxvmk2mtvy");
  });

  it("ignores the transformation toTikTokSafeUrl inserts", () => {
    const original =
      "https://res.cloudinary.com/dggavcyco/image/upload/v1787477367/vourdev-carousels/oldfho2099oxvmk2mtvy.jpg";
    // The derivative addresses the same asset, so both must resolve to one id — otherwise
    // a deck published to TikTok would leave its originals behind on cleanup.
    expect(publicIdFromUrl(toTikTokSafeUrl(original))).toBe(publicIdFromUrl(original));
  });

  it("keeps a nested folder path", () => {
    expect(
      publicIdFromUrl("https://res.cloudinary.com/c/image/upload/v1/a/b/c/name.jpg")
    ).toBe("a/b/c/name");
  });

  it("handles a URL with no version segment", () => {
    expect(
      publicIdFromUrl("https://res.cloudinary.com/c/image/upload/vourdev-carousels/x.jpg")
    ).toBe("vourdev-carousels/x");
  });

  it("refuses anything that is not a Cloudinary delivery URL", () => {
    // The next thing the caller does is delete, so a guess is worse than a refusal.
    expect(publicIdFromUrl("https://example.com/image/upload/v1/a/b.jpg")).toBeNull();
    expect(publicIdFromUrl("blob:http://localhost/abc")).toBeNull();
    expect(publicIdFromUrl("")).toBeNull();
  });
});

describe("destroyImage", () => {
  it("deletes by public id and reports success", async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result: "ok" } as any);
    const ok = await destroyImage(
      "https://res.cloudinary.com/dggavcyco/image/upload/v1/vourdev-carousels/x.jpg"
    );
    expect(ok).toBe(true);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      "vourdev-carousels/x",
      expect.objectContaining({ resource_type: "image", invalidate: true })
    );
  });

  it("reports false for an asset Cloudinary has already forgotten", async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result: "not found" } as any);
    expect(
      await destroyImage("https://res.cloudinary.com/c/image/upload/v1/a/b.jpg")
    ).toBe(false);
  });

  it("does not call Cloudinary for a URL it cannot parse", async () => {
    expect(await destroyImage("blob:http://localhost/abc")).toBe(false);
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });
});
