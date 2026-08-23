import { describe, it, expect } from "vitest";
import { supportsStructuredOutput } from "@/lib/ai/registry";

/**
 * Everything routed through omniroute lands on a combo that does not implement
 * structured outputs. The SDK says so at runtime —
 *
 *   AI SDK Warning (vour-high.chat / vour-combos):
 *   The feature "responseFormat" is not supported.
 *
 * — and `generateObject` then fails with "No object generated: could not parse
 * the response", every time. Nothing looked broken, because the generateText
 * path that follows produces a valid plan. It just cost a full model call first
 * that had no chance of succeeding, doubling the latency of every plan and
 * revision. On a degraded link that doubling is what pushed the request past
 * Cloudflare's 100s ceiling and returned a bare 524.
 */

const model = (provider: string) => ({ provider }) as any;

describe("supportsStructuredOutput", () => {
  it("rejects every omniroute-backed provider", () => {
    for (const p of ["vour-high.chat", "vour-lite.chat", "omniroute.chat"]) {
      expect(supportsStructuredOutput(model(p))).toBe(false);
    }
  });

  it("allows providers that do implement it", () => {
    for (const p of ["google.generative-ai", "deepseek.chat", "openrouter.chat", "mimo.chat"]) {
      expect(supportsStructuredOutput(model(p))).toBe(true);
    }
  });

  it("handles a bare model id string", () => {
    expect(supportsStructuredOutput("omniroute" as any)).toBe(false);
    expect(supportsStructuredOutput("deepseek" as any)).toBe(true);
  });

  // An unknown shape must not silently disable structured output for providers
  // that support it — the text path is a fallback, not the default.
  it("defaults to allowed when the provider cannot be determined", () => {
    expect(supportsStructuredOutput({} as any)).toBe(true);
    expect(supportsStructuredOutput(undefined as any)).toBe(true);
  });
});
