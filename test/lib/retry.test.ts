import { describe, it, expect, vi } from "vitest";
import { isTransientNetworkError, withRetry } from "@/lib/retry";

/**
 * The uplink this backend sits behind loses ~45% of its packets during provider
 * incidents. Every Turso call is an HTTPS round trip, so a single lost SYN turns
 * into `UND_ERR_CONNECT_TIMEOUT` after 10s and the whole request dies — even
 * though the very next attempt succeeds in under two seconds. Measured 22 Aug
 * 2026: six sequential fetches, five OK, one timeout.
 *
 * Retrying is only safe if we retry the right failures. A malformed statement
 * fails identically on every attempt; retrying it just multiplies the latency
 * before the user sees the same error.
 */

// undici nests the real cause one level down: the thrown value is a plain
// `TypeError: fetch failed` and the code lives on `.cause`.
function undiciTimeout() {
  const err = new TypeError("fetch failed");
  (err as any).cause = Object.assign(new Error("Connect Timeout Error"), {
    code: "UND_ERR_CONNECT_TIMEOUT",
  });
  return err;
}

describe("isTransientNetworkError", () => {
  it("recognizes an undici connect timeout nested in cause", () => {
    expect(isTransientNetworkError(undiciTimeout())).toBe(true);
  });

  it("recognizes bare socket-level codes", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "ENETUNREACH"]) {
      expect(isTransientNetworkError(Object.assign(new Error("x"), { code }))).toBe(true);
    }
  });

  it("recognizes a bare 'fetch failed' with no cause attached", () => {
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
  });

  it("walks a multi-level cause chain", () => {
    const deep = new Error("outer");
    (deep as any).cause = { cause: Object.assign(new Error("inner"), { code: "ECONNRESET" }) };
    expect(isTransientNetworkError(deep)).toBe(true);
  });

  // The bug that took the automation down on 21 Aug was a statement SQLite
  // rejects at parse time. Retrying it would have hidden nothing and cost 3x.
  it("does not treat a malformed statement as transient", () => {
    const err = Object.assign(new Error("SQLITE_UNKNOWN: SQLite error: 15 values for 14 columns"), {
      code: "SQLITE_UNKNOWN",
    });
    expect(isTransientNetworkError(err)).toBe(false);
  });

  it("does not treat an auth rejection as transient", () => {
    expect(isTransientNetworkError(new Error("Unauthorized"))).toBe(false);
  });

  it("survives non-Error values without throwing", () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError("boom")).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
  });

  // A cause chain that points at itself must not spin forever.
  it("terminates on a self-referential cause", () => {
    const err: any = new Error("loop");
    err.cause = err;
    expect(isTransientNetworkError(err)).toBe(false);
  });
});

describe("withRetry", () => {
  const noSleep = () => Promise.resolve();

  it("calls the function once when it succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and returns the later success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(undiciTimeout())
      .mockResolvedValue("ok");

    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("15 values for 14 columns"));

    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow("15 values for 14 columns");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget and rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue(undiciTimeout());

    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("fetch failed");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("backs off exponentially between attempts", async () => {
    const waits: number[] = [];
    const fn = vi.fn().mockRejectedValue(undiciTimeout());

    await expect(
      withRetry(fn, {
        attempts: 4,
        baseDelayMs: 100,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      })
    ).rejects.toThrow();

    // One sleep fewer than attempts: no wait after the final failure.
    expect(waits).toEqual([100, 200, 400]);
  });

  it("clamps the backoff at maxDelayMs", async () => {
    const waits: number[] = [];
    const fn = vi.fn().mockRejectedValue(undiciTimeout());

    await expect(
      withRetry(fn, {
        attempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 250,
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      })
    ).rejects.toThrow();

    expect(waits).toEqual([100, 200, 250, 250]);
  });

  it("reports each retry so the incident is visible in logs", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(undiciTimeout()).mockResolvedValue("ok");

    await withRetry(fn, { sleep: noSleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][1]).toBe(1);
  });
});
