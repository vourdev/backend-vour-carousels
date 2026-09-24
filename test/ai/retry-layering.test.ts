import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withRetry,
  isSdkRetryExhausted,
  isQueueSaturation,
  isNoTargetAvailable,
} from "@/lib/ai/generate";

/**
 * Two retry layers used to stack. The AI SDK retries a failed HTTP call three
 * times internally, and this module's `withRetry` retried the whole block three
 * times on top — nine attempts for one logical call.
 *
 * Production on 22 Aug 2026 showed exactly what that costs:
 *
 *   Automation failed: Failed after 3 attempts. Last error:
 *     Failed after 3 attempts. Last error: AI_APICallError: ... read ECONNRESET
 *
 * The message says "3 attempts" twice because both layers wrapped it, and the
 * accumulated backoff pushed the request past the reverse proxy's timeout, so
 * the caller got a 504 that named neither the model nor the network.
 *
 * The layers are kept but made non-multiplicative: the SDK owns transport
 * retries, this wrapper owns the failures the SDK never retries (unparseable
 * JSON, schema violations).
 */

// The AI SDK throws this once its own attempts are spent.
class RetryError extends Error {
  name = "AI_RetryError";
  constructor(message: string) {
    super(message);
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("isSdkRetryExhausted", () => {
  it("recognizes the SDK's exhausted-retry error by name", () => {
    expect(isSdkRetryExhausted(new RetryError("Failed after 3 attempts"))).toBe(true);
  });

  it("recognizes it by constructor name when the name field is absent", () => {
    class RetryError2 extends Error {}
    Object.defineProperty(RetryError2, "name", { value: "RetryError" });
    const err = new RetryError2("x");
    // Simulate a build where `name` was not set on the instance.
    delete (err as any).name;
    expect(isSdkRetryExhausted(err)).toBe(true);
  });

  it("does not claim ordinary failures", () => {
    expect(isSdkRetryExhausted(new Error("Unexpected token < in JSON"))).toBe(false);
    expect(isSdkRetryExhausted(null)).toBe(false);
    expect(isSdkRetryExhausted(undefined)).toBe(false);
  });
});

describe("withRetry layering", () => {
  it("still retries a parse failure, which the SDK never retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new SyntaxError("Unexpected token < in JSON at position 0"))
      .mockResolvedValue("plan");

    await expect(withRetry(fn)).resolves.toBe("plan");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // The whole point: one logical call must not cost nine HTTP attempts.
  it("does not retry once the SDK has exhausted its own transport retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new RetryError("Failed after 3 attempts. Last error: read ECONNRESET"));

    await expect(withRetry(fn)).rejects.toThrow(/read ECONNRESET/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the SDK error untouched so the message stays single-level", async () => {
    const original = new RetryError("Failed after 3 attempts. Last error: read ECONNRESET");
    const fn = vi.fn().mockRejectedValue(original);

    const caught = await withRetry(fn).catch((e) => e);

    expect(caught).toBe(original);
    // The doubled prefix that confused the incident must not reappear.
    expect(caught.message.match(/Failed after \d+ attempts/g)).toHaveLength(1);
  });

  it("still wraps non-SDK failures with its own attempt count", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("schema mismatch"));

    await expect(withRetry(fn, 2)).rejects.toThrow(/Failed after 2 attempts.*schema mismatch/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns immediately on success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

/**
 * The 23 Sep 2026 nightly produced nothing on either domain. The VPS uplink dropped for a
 * few minutes; OmniRoute read `fetch failed` as a rate limit and cooled down all five
 * antigravity accounts for 5 seconds; `vour-combos` resolves to one model, so there was no
 * second provider; and the retry ladder here (2.5s, 5s) spent its final attempt 2 seconds
 * before the cooldown expired. Every layer was individually defensible and the night was
 * still lost, so this class of failure now waits long enough to matter.
 */
describe("isNoTargetAvailable", () => {
  const body =
    '{"error":{"message":"Service temporarily unavailable: all targets were skipped by ' +
    'pre-dispatch filters","type":"service_unavailable","code":"ALL_TARGETS_SKIPPED"},' +
    '"diagnostics":{"poolSize":4,"attempted":0}}';

  it("recognizes the gateway's own error code", () => {
    expect(isNoTargetAvailable({ message: "AI_APICallError", responseBody: body })).toBe(true);
  });

  it("recognizes the prose form the message arrives in when the body is dropped", () => {
    const err = new Error(
      "Service temporarily unavailable: all targets were skipped by pre-dispatch filters"
    );
    expect(isNoTargetAvailable(err)).toBe(true);
  });

  it("reads through a wrapped cause", () => {
    const err = new Error("request failed");
    (err as any).cause = new Error("ALL_TARGETS_SKIPPED");
    expect(isNoTargetAvailable(err)).toBe(true);
  });

  it("does not claim a saturated queue, which drains on its own schedule", () => {
    const saturated = new Error(
      "Request dropped after exceeding the local rate-limit queue budget maxWaitMs (120000ms)"
    );
    expect(isNoTargetAvailable(saturated)).toBe(false);
    expect(isQueueSaturation(saturated)).toBe(true);
  });

  it("does not claim an ordinary parse failure", () => {
    expect(isNoTargetAvailable(new SyntaxError("Unexpected token <"))).toBe(false);
    expect(isNoTargetAvailable(null)).toBe(false);
  });
});

describe("withRetry backoff class", () => {
  it("waits out a cooldown instead of re-asking inside it", async () => {
    vi.useFakeTimers();
    try {
      const err = Object.assign(new Error("AI_APICallError"), {
        responseBody: '{"code":"ALL_TARGETS_SKIPPED","diagnostics":{"attempted":0}}',
      });
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("plan");

      const pending = withRetry(fn);
      await vi.advanceTimersByTimeAsync(2_500);
      // The old ladder would have already spent its second attempt by now.
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      await expect(pending).resolves.toBe("plan");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still comes back quickly for a failure that is about the answer", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new SyntaxError("Unexpected token <"))
        .mockResolvedValue("plan");

      const pending = withRetry(fn);
      await vi.advanceTimersByTimeAsync(2_500);
      await expect(pending).resolves.toBe("plan");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * `generateSlidePlan` and the revision paths fall back from `generateObject` to
 * `generateText` when the first call throws. That fallback is for a model that
 * answered with JSON the schema rejects — not for a transport that never
 * delivered an answer, which will fail identically and spend another three SDK
 * attempts doing it. Together with the outer wrapper that was six HTTP attempts
 * per request, enough to cross Cloudflare's 100s ceiling and return `524`.
 */
describe("generateObject -> generateText fallback guard", () => {
  it("treats an exhausted transport as not worth a second method", () => {
    const transport = new RetryError("Failed after 3 attempts. Last error: read ECONNRESET");
    expect(isSdkRetryExhausted(transport)).toBe(true);
  });

  it("still allows the fallback for the schema failure it exists for", () => {
    const schemaFailure = Object.assign(new Error("response did not match schema"), {
      name: "AI_NoObjectGeneratedError",
    });
    expect(isSdkRetryExhausted(schemaFailure)).toBe(false);
  });

  it("still allows the fallback for unparseable JSON", () => {
    expect(isSdkRetryExhausted(new SyntaxError("Unexpected token < in JSON at position 0"))).toBe(
      false
    );
  });
});
