import { describe, it, expect } from "vitest";
import { proposeOfficialUrls, apex } from "../../src/lib/evidence/resolve-url";

/**
 * A model that answers with whatever text the test hands it.
 *
 * `generateText` is called with a real LanguageModel, so this implements the v2 spec's
 * `doGenerate` rather than mocking the SDK — the same shape the AI SDK's own test doubles
 * use, and it keeps the parsing under test instead of stubbed out.
 */
function fakeModel(text: string) {
  return {
    specificationVersion: "v2",
    provider: "test",
    modelId: "test",
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text" as const, text }],
        finishReason: "stop" as const,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
  } as any;
}

const answer = (candidates: Array<{ url: string; confidence?: string }>) =>
  fakeModel(JSON.stringify({ candidates }));

describe("proposeOfficialUrls", () => {
  it("returns a confident candidate", async () => {
    const out = await proposeOfficialUrls(
      "OpenCode homepage",
      answer([{ url: "https://opencode.ai", confidence: "high" }])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.candidates[0]).toMatchObject({ url: "https://opencode.ai", host: "opencode.ai", rank: 0 });
  });

  it("keeps the model's ordering and caps the list at three", async () => {
    const out = await proposeOfficialUrls(
      "Thing",
      answer([
        { url: "https://one.dev", confidence: "high" },
        { url: "https://two.dev", confidence: "high" },
        { url: "https://three.dev", confidence: "high" },
        { url: "https://four.dev", confidence: "high" },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.candidates.map((c) => c.host)).toEqual(["one.dev", "two.dev", "three.dev"]);
  });

  it("keeps a guess, but behind every domain the model is sure of", async () => {
    // Confidence orders the queue rather than vetoing: a wrong guess costs one page load
    // and is thrown away by the identity gate, while dropping it costs the slide its
    // screenshot. The real OpenCode domain only ever arrives as a second guess.
    const out = await proposeOfficialUrls(
      "OpenCode",
      answer([
        { url: "https://opencode.dev", confidence: "low" },
        { url: "https://opencode.ai", confidence: "high" },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidates.map((c) => c.host)).toEqual(["opencode.ai", "opencode.dev"]);
      expect(out.candidates[0].confidence).toBe("high");
      expect(out.candidates.map((c) => c.rank)).toEqual([0, 1]);
    }
  });

  it("drops plain http rather than upgrading it silently", async () => {
    const out = await proposeOfficialUrls("legacy", answer([{ url: "http://legacy.example", confidence: "high" }]));
    expect(out).toMatchObject({ ok: false, reason: "not-https" });
  });

  it("drops an aggregator even when the model is confident about it", async () => {
    // A model asked for an official site will happily answer with the Wikipedia article,
    // and that page WOULD pass the identity check — it really is about the entity.
    const out = await proposeOfficialUrls(
      "kubernetes",
      answer([{ url: "https://en.wikipedia.org/wiki/Kubernetes", confidence: "high" }])
    );
    expect(out).toMatchObject({ ok: false, reason: "aggregator" });
  });

  it("keeps the good candidate when only some are rejected", async () => {
    const out = await proposeOfficialUrls(
      "kubernetes",
      answer([
        { url: "https://en.wikipedia.org/wiki/Kubernetes", confidence: "high" },
        { url: "https://kubernetes.io", confidence: "high" },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.candidates.map((c) => c.host)).toEqual(["kubernetes.io"]);
  });

  it("collapses duplicate hosts", async () => {
    const out = await proposeOfficialUrls(
      "OpenCode",
      answer([
        { url: "https://opencode.ai", confidence: "high" },
        { url: "https://www.opencode.ai/docs", confidence: "high" },
      ])
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.candidates).toHaveLength(1);
  });

  it("accepts an empty candidate list as a real answer", async () => {
    // "I do not remember this domain" is the correct answer for an unknown entity, and it
    // must not be turned into a guess.
    const out = await proposeOfficialUrls("Zorblax quantum framework", answer([]));
    expect(out).toMatchObject({ ok: false, reason: "no-candidates" });
  });

  it("reads a fenced answer and the older single-object shape", async () => {
    const fenced = await proposeOfficialUrls(
      "OpenCode",
      fakeModel('```json\n{"url":"https://opencode.ai","confidence":"high"}\n```')
    );
    expect(fenced.ok).toBe(true);
  });

  it("reports unparseable when the model does not answer in JSON", async () => {
    const out = await proposeOfficialUrls("something", fakeModel("I am not sure, sorry."));
    expect(out).toMatchObject({ ok: false, reason: "unparseable" });
  });

  it("reports no-model when nothing is configured", async () => {
    const out = await proposeOfficialUrls("anything", null);
    // `null` is "explicitly none" — distinct from `undefined`, which resolves the default.
    expect(out).toMatchObject({ ok: false, reason: "no-model" });
  });

  it("survives a model that throws", async () => {
    const boom = {
      specificationVersion: "v2",
      provider: "test",
      modelId: "test",
      supportedUrls: {},
      async doGenerate() {
        throw new Error("upstream 503");
      },
    } as any;
    const out = await proposeOfficialUrls("anything", boom);
    expect(out).toMatchObject({ ok: false, reason: "no-answer" });
  });
});

describe("apex", () => {
  it("strips only the www prefix", () => {
    expect(apex("www.Opencode.AI")).toBe("opencode.ai");
    expect(apex("docs.opencode.ai")).toBe("docs.opencode.ai");
  });
});
