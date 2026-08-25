import { describe, it, expect } from "vitest";
import { availableModels, defaultModel, resolveModel } from "@/lib/ai/registry";

const base = {} as NodeJS.ProcessEnv;

/**
 * OmniRoute is the only selectable provider. Its combos already fall back
 * across models internally, so a second provider here would be a fallback
 * around a fallback — and, in practice, meant a raw Gemini key silently
 * outranked it and took the default with no fallback at all.
 */
describe("availableModels", () => {
  it("is empty when no keys are set", () => {
    expect(availableModels(base)).toEqual([]);
  });

  it("ignores providers other than omniroute, however configured", () => {
    const others = {
      ...base,
      GOOGLE_GENERATIVE_AI_API_KEY: "k",
      DEEPSEEK_API_KEY: "d",
      OPENROUTER_API_KEY: "o",
      MIMO_API_KEY: "m",
      MIMO_BASE_URL: "u",
      MIMO_MODEL: "x",
    };
    expect(availableModels(others)).toEqual([]);
  });

  it("lists the two vour tiers once omniroute's key and base url are set", () => {
    const env = { ...base, OMNIROUTE_API_KEY: "k", OMNIROUTE_BASE_URL: "u" };
    expect(availableModels(env)).toEqual(["vour-high", "vour-lite"]);
  });

  it("requires all OMNIROUTE vars for the raw omniroute entry", () => {
    expect(availableModels({ ...base, OMNIROUTE_API_KEY: "o" })).toEqual([]);

    const fullModel = { ...base, OMNIROUTE_API_KEY: "k", OMNIROUTE_BASE_URL: "u", OMNIROUTE_MODEL: "m" };
    expect(availableModels(fullModel)).toEqual(["vour-high", "vour-lite", "omniroute"]);

    const fullCombo = { ...base, OMNIROUTE_API_KEY: "k", OMNIROUTE_BASE_URL: "u", OMNIROUTE_COMBO: "my-combo" };
    expect(availableModels(fullCombo)).toEqual(["vour-high", "vour-lite", "omniroute"]);
  });
});

describe("the retired gemini id", () => {
  it("resolves without reaching for a Google provider", async () => {
    // Saved carousels and drafts store the model id they were made with, and "gemini" is
    // in some of them. The provider SDK is gone, so opening one of those records must not
    // throw — it falls back to the combo it would be regenerated with today.
    const env = { OMNIROUTE_API_KEY: "k", OMNIROUTE_BASE_URL: "https://example.test/v1" };
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const model: any = resolveModel("gemini");
      expect(String(model.provider)).toContain("vour-lite");
    } finally {
      process.env = saved as NodeJS.ProcessEnv;
    }
  });
});

describe("defaultModel", () => {
  it("is vour-high whenever omniroute is configured", () => {
    const env = { ...base, OMNIROUTE_API_KEY: "k", OMNIROUTE_BASE_URL: "u" };
    expect(defaultModel(env)).toBe("vour-high");
  });

  it("stays null when only other providers have keys", () => {
    expect(defaultModel({ ...base, GOOGLE_GENERATIVE_AI_API_KEY: "k", DEEPSEEK_API_KEY: "d" })).toBeNull();
  });

  it("is null when nothing is configured", () => {
    expect(defaultModel(base)).toBeNull();
  });
});
