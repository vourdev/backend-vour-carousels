import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Capture is the most expensive step in the pipeline, and its output used to reach the
 * browser as base64 only — `URL.createObjectURL()` blobs that a refresh throws away, at
 * which point the wizard re-ran the whole capture. Persisting here is what makes the
 * result outlive the page.
 */

let dir: string;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "slides-"));
  process.env.SLIDE_STORE_DIR = dir;
  process.env.PUBLIC_SLIDE_BASE = "https://cdn.vour.dev/slides";
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("uploadSlides", () => {
  it("keeps slide order and names every file after its contents", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");

    const { urls, hashes } = await uploadSlides(["0", "1", "2", "3", "4"]);

    expect(urls).toEqual(
      ["0", "1", "2", "3", "4"].map((b) => `https://cdn.vour.dev/slides/${sha(b)}.jpg`)
    );
    expect(hashes).toEqual(["0", "1", "2", "3", "4"].map(sha));
    expect((await readdir(dir)).sort()).toEqual(
      ["0", "1", "2", "3", "4"].map((b) => `${sha(b)}.jpg`).sort()
    );
  });

  /**
   * The URL follows from the hash alone, so a re-export of an unchanged deck resolves to
   * exactly the URLs already on the row. That is what makes a revision cheap: nothing has
   * to be compared against the previous run, and nothing is rewritten.
   */
  it("gives identical slides identical URLs across separate exports", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");

    const first = await uploadSlides(["a", "b"]);
    const second = await uploadSlides(["a", "b"]);

    expect(second.urls).toEqual(first.urls);
    expect(await readdir(dir)).toHaveLength(2);
  });

  /** A deck that repeats a slide stores it once — same bytes, same name. */
  it("collapses duplicate slides onto one file", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");

    const { urls, error } = await uploadSlides(["same", "same", "other"]);

    // Asserted before the URLs: on failure `urls` is empty, and comparing two undefined
    // entries passes while the deck was in fact lost.
    expect(error).toBeUndefined();
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(urls[1]);
    expect(urls[2]).not.toBe(urls[0]);
    expect(await readdir(dir)).toHaveLength(2);
  });

  it("returns nothing for an empty deck without touching the disk", async () => {
    const { uploadSlides } = await import("@/lib/publish/upload-slides");

    expect(await uploadSlides([])).toEqual({ urls: [], hashes: [] });
    expect(await readdir(dir)).toEqual([]);
  });

  /**
   * `uploadSlides` is all-or-nothing by design: a partial list would be persisted, and a
   * later publish would post a deck with slides missing without anything having failed
   * loudly.
   */
  it("reports an error and no URLs when one slide cannot be written", async () => {
    const store = await import("@/lib/publish/local-store");
    vi.spyOn(store, "storeSlide").mockImplementation(async (_b64: string, hash: string) => {
      if (hash === sha("c")) throw new Error("ENOSPC: no space left on device");
      return `https://cdn.vour.dev/slides/${hash}.jpg`;
    });
    const { uploadSlides } = await import("@/lib/publish/upload-slides");

    const res = await uploadSlides(["a", "b", "c", "d"]);

    expect(res.urls).toEqual([]);
    expect(res.hashes).toEqual([]);
    expect(res.error).toMatch(/ENOSPC/);
  });
});
