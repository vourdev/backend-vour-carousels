import { describe, it, expect, vi } from "vitest";
import { withDeadline } from "@/lib/retry";

/**
 * `POST /api/plan` gathers mockup-diversity context before asking the model for
 * anything. That context is advisory — both queries already fall back to an
 * empty list — but on a link dropping ~47% of its packets each one can spend the
 * full retry budget first. Added to the model call, the request crossed
 * Cloudflare's 100s ceiling and the user saw a bare `524: <none>`, which names
 * neither the database nor the model.
 */
describe("withDeadline", () => {
  it("returns the real value when it arrives in time", async () => {
    await expect(withDeadline(Promise.resolve("real"), 1000, "fallback")).resolves.toBe("real");
  });

  it("returns the fallback once the deadline passes", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((r) => setTimeout(() => r("real"), 10_000));
    const result = withDeadline(slow, 100, "fallback");
    await vi.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toBe("fallback");
    vi.useRealTimers();
  });

  it("returns the fallback when the promise rejects", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("fetch failed")), 1000, [] as string[])
    ).resolves.toEqual([]);
  });

  // A late rejection must not become an unhandled rejection after the deadline
  // already resolved the caller.
  it("swallows a rejection that lands after the deadline", async () => {
    vi.useFakeTimers();
    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);

    const late = new Promise((_, reject) => setTimeout(() => reject(new Error("too late")), 5_000));
    const result = withDeadline(late, 50, "fallback");
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe("fallback");
    await vi.advanceTimersByTimeAsync(6_000);

    process.off("unhandledRejection", onUnhandled);
    vi.useRealTimers();
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it("does not wait out the deadline when the value is already there", async () => {
    const started = Date.now();
    await withDeadline(Promise.resolve(1), 5_000, 0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
