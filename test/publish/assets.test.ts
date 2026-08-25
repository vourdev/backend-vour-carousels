import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Slides moved from Cloudinary to this VPS's own disk on 25 Aug 2026, and the rows
 * written before that still hold Cloudinary URLs. Both kinds are cleaned up from the
 * same History screen, so the stored URL is the only thing that says which store owns
 * an asset — and getting that wrong means either a file that is never freed or a delete
 * call aimed at the wrong service.
 */

const destroyImage = vi.fn();
vi.mock("@/lib/publish/cloudinary", () => ({
  destroyImage: (...a: unknown[]) => destroyImage(...a),
}));

let dir: string;
const HASH = "b".repeat(64);
const LOCAL = `https://cdn.vour.dev/slides/${HASH}.jpg`;
const LEGACY = "https://res.cloudinary.com/c/image/upload/v1787/vourdev-carousels/x.jpg";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "assets-"));
  process.env.SLIDE_STORE_DIR = dir;
  process.env.PUBLIC_SLIDE_BASE = "https://cdn.vour.dev/slides";
  destroyImage.mockReset();
  destroyImage.mockResolvedValue(true);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("deleteAsset", () => {
  it("unlinks a local slide without calling Cloudinary", async () => {
    await writeFile(join(dir, `${HASH}.jpg`), "bytes");
    const { deleteAsset } = await import("@/lib/publish/assets");

    expect(await deleteAsset(LOCAL)).toBe(true);
    expect(await readdir(dir)).toEqual([]);
    expect(destroyImage).not.toHaveBeenCalled();
  });

  it("sends a legacy Cloudinary URL to Cloudinary", async () => {
    const { deleteAsset } = await import("@/lib/publish/assets");

    expect(await deleteAsset(LEGACY)).toBe(true);
    expect(destroyImage).toHaveBeenCalledWith(LEGACY);
  });

  /**
   * Anything that is not recognisably one of ours routes to the legacy path rather than
   * being treated as a filename — the alternative is a delete driven by a stored string.
   */
  it("does not treat a lookalike URL as a local file", async () => {
    const { deleteAsset } = await import("@/lib/publish/assets");

    await deleteAsset("https://cdn.vour.dev/slides/../../etc/passwd");

    expect(destroyImage).toHaveBeenCalledWith("https://cdn.vour.dev/slides/../../etc/passwd");
  });
});
