import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry, isSdkRetryExhausted } from "@/lib/ai/generate";

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
