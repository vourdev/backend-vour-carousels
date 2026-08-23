import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `/api/assemble` awaited `warmUpIllustrations()` before rendering anything, and
 * that warm-up runs `SELECT slug, variant, svg FROM illustrations` — every SVG
 * body, about 3.9 MB. Over a link dropping ~47% of its packets it blocked long
 * enough that the Vercel function gave up and closed the connection; nginx
 * logged `POST /api/assemble ... 499` and the user saw a slide build that never
 * produced anything.
 *
 * The wait was never load-bearing: the same SVGs ship inside the image and
 * `read()` falls back to them per slug.
 */

const execute = vi.fn();
vi.mock("@/lib/libsql", () => ({
  createRetryingClient: () => ({ execute: (...a: unknown[]) => execute(...a) }),
  dbConfig: () => ({ url: "file:test.db" }),
}));

beforeEach(() => {
  execute.mockReset();
  vi.resetModules();
});

describe("warmUpIllustrations", () => {
  it("returns without waiting out a database that never answers", async () => {
    // Never settles — the degraded-link case.
    execute.mockImplementation(() => new Promise(() => {}));
    const { warmUpIllustrations } = await import("@/lib/ds/illustrations.server");

    vi.useFakeTimers();
    const pending = warmUpIllustrations();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();
    await pending;

    expect(settled).toBe(true);
  });

  it("still populates the cache when the database answers in time", async () => {
    execute.mockResolvedValue({ rows: [{ slug: "learning_qt7d", variant: "onDark", svg: "<svg/>" }] });
    const { warmUpIllustrations } = await import("@/lib/ds/illustrations.server");

    await warmUpIllustrations();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("queries only once no matter how many requests warm up", async () => {
    execute.mockResolvedValue({ rows: [] });
    const { warmUpIllustrations } = await import("@/lib/ds/illustrations.server");

    await Promise.all([warmUpIllustrations(), warmUpIllustrations(), warmUpIllustrations()]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not reject when the query fails outright", async () => {
    execute.mockRejectedValue(new Error("fetch failed"));
    const { warmUpIllustrations } = await import("@/lib/ds/illustrations.server");

    await expect(warmUpIllustrations()).resolves.toBeUndefined();
  });
});
