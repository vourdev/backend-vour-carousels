import { describe, it, expect, afterEach } from "vitest";
import { aiCallDefaults } from "../../src/lib/ai/registry";
import { isQueueSaturation } from "../../src/lib/ai/generate";

describe("aiCallDefaults", () => {
  const saved = process.env.OMNIROUTE_SDK_RETRIES;
  afterEach(() => {
    if (saved === undefined) delete process.env.OMNIROUTE_SDK_RETRIES;
    else process.env.OMNIROUTE_SDK_RETRIES = saved;
  });

  it("turns the transport's own retries off by default", () => {
    delete process.env.OMNIROUTE_SDK_RETRIES;
    // The AI SDK default is 2, which turned one user action into three OmniRoute requests.
    expect(aiCallDefaults().maxRetries).toBe(0);
  });

  it("can be raised again without a deploy", () => {
    process.env.OMNIROUTE_SDK_RETRIES = "2";
    expect(aiCallDefaults().maxRetries).toBe(2);
  });

  it("ignores a value that is not a number", () => {
    process.env.OMNIROUTE_SDK_RETRIES = "banyak";
    expect(aiCallDefaults().maxRetries).toBe(0);
  });
});

describe("isQueueSaturation", () => {
  it("recognises OmniRoute's queue-budget rejection", () => {
    const err = {
      message:
        "[502]: Request dropped after exceeding the local rate-limit queue budget maxWaitMs (120000ms) for agy/gemini-3.5-flash-high",
    };
    expect(isQueueSaturation(err)).toBe(true);
  });

  it("reads it out of the response body too", () => {
    const err = {
      message: "Bad Gateway",
      responseBody: JSON.stringify({ error: "resilienceSettings.requestQueue.maxWaitMs exceeded" }),
    };
    expect(isQueueSaturation(err)).toBe(true);
  });

  it("reads it out of a wrapped cause", () => {
    const err = { message: "fetch failed", cause: { message: "queue budget exhausted" } };
    expect(isQueueSaturation(err)).toBe(true);
  });

  it("does not fire on an ordinary transport failure", () => {
    // These must keep the short 2.5s backoff — a dropped socket is not back-pressure.
    expect(isQueueSaturation({ message: "socket hang up" })).toBe(false);
    expect(isQueueSaturation({ message: "[500]: upstream model returned an error" })).toBe(false);
    expect(isQueueSaturation({})).toBe(false);
    expect(isQueueSaturation(null)).toBe(false);
  });
});
