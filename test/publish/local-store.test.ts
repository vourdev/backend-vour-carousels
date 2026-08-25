import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Slides are written here instead of being pushed to Cloudinary, which on this VPS's
 * uplink took 85.9s for a 1.8 MB deck. nginx serves this directory directly and
 * Cloudflare caches what it gets for a year, so two properties matter more than speed:
 * a URL must never change meaning, and a reader must never catch a half-written file.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "slides-"));
  process.env.SLIDE_STORE_DIR = dir;
  process.env.PUBLIC_SLIDE_BASE = "https://cdn.vour.dev/slides";
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const HASH = "a".repeat(64);

describe("storeSlide", () => {
  it("writes the decoded bytes under the hash and returns its public URL", async () => {
    const { storeSlide } = await import("@/lib/publish/local-store");
    const b64 = Buffer.from("fake-jpeg-bytes").toString("base64");

    const url = await storeSlide(b64, HASH);

    expect(url).toBe(`https://cdn.vour.dev/slides/${HASH}.jpg`);
    expect((await readFile(join(dir, `${HASH}.jpg`))).toString()).toBe("fake-jpeg-bytes");
  });

  it("strips a data URL prefix rather than storing it as content", async () => {
    const { storeSlide } = await import("@/lib/publish/local-store");
    const b64 = Buffer.from("png-bytes").toString("base64");

    await storeSlide(`data:image/png;base64,${b64}`, HASH);

    expect((await readFile(join(dir, `${HASH}.jpg`))).toString()).toBe("png-bytes");
  });

  /**
   * Cloudflare is told these are immutable, so a truncated file that reached a reader
   * would stay truncated at that URL for a year. The write goes to a temporary name and
   * is renamed into place, which is atomic on one filesystem — a reader sees all of it
   * or none of it, never part.
   */
  it("leaves no temporary file behind", async () => {
    const { storeSlide } = await import("@/lib/publish/local-store");
    await storeSlide(Buffer.from("x").toString("base64"), HASH);

    expect(await readdir(dir)).toEqual([`${HASH}.jpg`]);
  });

  /** The name is the hash of the contents, so an existing file already holds these bytes. */
  it("does not rewrite a slide that is already stored", async () => {
    const { storeSlide } = await import("@/lib/publish/local-store");
    await writeFile(join(dir, `${HASH}.jpg`), "original");

    const url = await storeSlide(Buffer.from("different").toString("base64"), HASH);

    expect(url).toBe(`https://cdn.vour.dev/slides/${HASH}.jpg`);
    expect((await readFile(join(dir, `${HASH}.jpg`))).toString()).toBe("original");
  });

  it("creates the directory on first use", async () => {
    const { storeSlide } = await import("@/lib/publish/local-store");
    process.env.SLIDE_STORE_DIR = join(dir, "nested", "deeper");

    await storeSlide(Buffer.from("x").toString("base64"), HASH);

    expect(await readdir(join(dir, "nested", "deeper"))).toEqual([`${HASH}.jpg`]);
  });
});

describe("isLocalSlideUrl", () => {
  it("claims its own URLs and disowns Cloudinary's", async () => {
    const { isLocalSlideUrl } = await import("@/lib/publish/local-store");

    expect(isLocalSlideUrl(`https://cdn.vour.dev/slides/${HASH}.jpg`)).toBe(true);
    expect(
      isLocalSlideUrl("https://res.cloudinary.com/c/image/upload/v1/vourdev-carousels/x.jpg")
    ).toBe(false);
  });

  /**
   * A stored URL is the only thing that says which store owns an asset, and the caller's
   * next move is a delete. Anything that is not exactly one of ours has to route to the
   * legacy path instead.
   */
  it("rejects a matching prefix that does not carry a hash", async () => {
    const { isLocalSlideUrl } = await import("@/lib/publish/local-store");

    expect(isLocalSlideUrl("https://cdn.vour.dev/slides/../../etc/passwd")).toBe(false);
    expect(isLocalSlideUrl("https://cdn.vour.dev/slides/not-a-hash.jpg")).toBe(false);
    expect(isLocalSlideUrl(`https://cdn.vour.dev/slides/${"A".repeat(64)}.jpg`)).toBe(false);
    expect(isLocalSlideUrl(`https://evil.example/slides/${HASH}.jpg`)).toBe(false);
  });
});

describe("deleteSlide", () => {
  it("removes the file and reports it", async () => {
    const { deleteSlide, storeSlide } = await import("@/lib/publish/local-store");
    const url = await storeSlide(Buffer.from("x").toString("base64"), HASH);

    expect(await deleteSlide(url)).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });

  /**
   * A cleanup run over a deck that was partly cleaned before has to finish the job, not
   * stop on the first name that is already gone.
   */
  it("resolves false for a slide that is already gone", async () => {
    const { deleteSlide } = await import("@/lib/publish/local-store");

    expect(await deleteSlide(`https://cdn.vour.dev/slides/${HASH}.jpg`)).toBe(false);
    expect(await deleteSlide("https://res.cloudinary.com/c/image/upload/v1/x.jpg")).toBe(false);
  });
});
