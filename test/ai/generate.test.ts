import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { generateBrief, generateSlidePlan } from "@/lib/ai/generate";

// Minimal generate result for the mock. Cast to the SDK type — the runtime
// only reads content/finishReason/usage; the full nested shape isn't needed.
const result = (text: string) =>
  ({
    finishReason: { unified: "stop" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
    content: [{ type: "text", text }],
    warnings: [],
  }) as unknown as LanguageModelV4GenerateResult;

const textModel = new MockLanguageModelV4({
  doGenerate: async () => result("# Carousel Content — Test"),
});

const planObject = {
  title: "T",
  caption: "c",
  hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
  slides: [{ role: "cover", eyebrow: "E", headline: "H", accentWord: "H" }],
};

const objectModel = new MockLanguageModelV4({
  doGenerate: async () => result(JSON.stringify(planObject)),
});

describe("generateBrief", () => {
  it("returns the model text", async () => {
    expect(await generateBrief("idea", textModel)).toContain("# Carousel Content");
  });

  it("retries 3 times and formats the error", async () => {
    let callCount = 0;
    const failingModel = new MockLanguageModelV4({
      doGenerate: async () => {
        callCount++;
        throw new Error("AI_APICallError: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.");
      },
    });

    await expect(generateBrief("idea", failingModel)).rejects.toThrow(
      "Failed after 3 attempts. Last error: AI_APICallError: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."
    );
    expect(callCount).toBe(3);
  }, 12000);
});

describe("generateSlidePlan", () => {
  it("returns a schema-valid slide plan", async () => {
    const plan = await generateSlidePlan("# brief", objectModel);
    expect(plan.slides[0].role).toBe("cover");
    expect(plan.title).toBe("T");
  });

  it("gives a mockup-less point slide a real mockup instead of leaving it bare", async () => {
    // `mockup` is optional in the schema, so a bare point slide validates and nothing
    // downstream notices. The renderer used to hide it by fabricating a card out of the
    // slide's own body text; now it renders nothing, so the gap has to be closed here.
    const bare = {
      title: "T",
      caption: "c",
      hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
      slides: [
        { role: "cover", eyebrow: "E", headline: "H", accentWord: "H" },
        { role: "point", counter: "02 / 03", eyebrow: "TANDA 03", headline: "H2", body: "b" },
      ],
    };
    const model = new MockLanguageModelV4({
      doGenerate: async () => result(JSON.stringify(bare)),
    });
    const plan = await generateSlidePlan("# brief", model);
    const s = plan.slides[1];
    expect(s.role).toBe("point");
    if (s.role !== "point") return;
    expect(s.mockup?.type).toBe("illustration");
  });

  it("leaves a point slide that already has a mockup alone", async () => {
    const withMockup = {
      title: "T",
      caption: "c",
      hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
      slides: [
        { role: "cover", eyebrow: "E", headline: "H", accentWord: "H" },
        {
          role: "point",
          counter: "02 / 03",
          eyebrow: "E2",
          headline: "H2",
          body: "b",
          mockup: { type: "bigstat", number: "3x", caption: "faster" },
        },
      ],
    };
    const model = new MockLanguageModelV4({
      doGenerate: async () => result(JSON.stringify(withMockup)),
    });
    const plan = await generateSlidePlan("# brief", model);
    const s = plan.slides[1];
    if (s.role !== "point") throw new Error("unexpected role");
    expect(s.mockup?.type).toBe("bigstat");
  });
});

/**
 * The safety net enforces the prompt's illustration rule. The prompt states two
 * exclusions before it mandates one, and for a long time the code ignored both.
 */
describe("illustration safety net scope", () => {
  const plan = (body: string, mockup: unknown) => ({
    title: "T",
    caption: "c",
    hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
    slides: [
      { role: "cover", eyebrow: "E", headline: "H" },
      { role: "point", counter: "02 / 02", eyebrow: "P", headline: "H", body, mockup },
    ],
  });

  const mockupOf = async (body: string, mockup: unknown) => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => result(JSON.stringify(plan(body, mockup))),
    });
    const out = await generateSlidePlan("brief", model);
    const slide = out.slides[1];
    return slide.role === "point" ? slide.mockup : undefined;
  };

  it("leaves a comparison alone even when the body says 'mirip'", async () => {
    const m = await mockupOf("Alurnya mirip dengan versi sebelumnya, cuma lebih cepat.", {
      type: "comparison",
      loserLabel: "Sebelum", loserLine: "Lambat",
      winnerLabel: "Sesudah", winnerLine: "Cepat",
    });
    expect(m?.type).toBe("comparison");
  });

  it("leaves a terminal alone even when the body says 'seperti'", async () => {
    const m = await mockupOf("Outputnya seperti ini kalau konfigurasinya benar.", {
      type: "terminal", filename: "app.ts", lines: [{ text: "ok", style: "plain" }],
    });
    expect(m?.type).toBe("terminal");
  });

  it("does not fire on 'kayaknya', which is ordinary prose", async () => {
    const m = await mockupOf("Kayaknya banyak yang belum tau soal ini.", {
      type: "flow", steps: [{ label: "A" }, { label: "B" }],
    });
    expect(m?.type).toBe("flow");
  });

  it("still overrides a real analogy on a non-excluded mockup", async () => {
    const m = await mockupOf("Index itu kayak daftar isi di buku.", {
      type: "hub", center: "Index", tools: [{ icon: "database", label: "DB" }, { icon: "search", label: "Cari" }],
    });
    expect(m?.type).toBe("illustration");
  });
});

/**
 * Measured on 7 generated decks: 5 of them named the same layout on two consecutive
 * slides, despite the prompt forbidding it. The renderer's alternation only covers
 * slides that name nothing, so the sequence has to be resolved at plan level too.
 */
describe("consecutive layout variety", () => {
  const deckOf = (layouts: (string | undefined)[]) => ({
    title: "T",
    caption: "c",
    hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
    slides: [
      { role: "cover", eyebrow: "E", headline: "H" },
      ...layouts.map((layout, n) => ({
        role: "point",
        counter: `0${n + 1} / 0${layouts.length}`,
        eyebrow: `P${n}`,
        headline: "H",
        body: "Body copy without any analogy marker in it.",
        ...(layout ? { layout } : {}),
        mockup: { type: "flow", steps: [{ label: "A" }, { label: "B" }] },
      })),
    ],
  });

  const layoutsOf = async (layouts: (string | undefined)[]) => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => result(JSON.stringify(deckOf(layouts))),
    });
    const out = await generateSlidePlan("brief", model);
    return out.slides.flatMap((s) => (s.role === "point" ? [s.layout] : []));
  };

  it("breaks up a run the model asked for", async () => {
    const got = await layoutsOf(["standard", "standard", "standard", "standard"]);
    expect(got).toHaveLength(4);
    for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
  });

  it("leaves an already-varied sequence as the model wrote it", async () => {
    const got = await layoutsOf(["standard", "mockup-forward", "standard"]);
    expect(got).toEqual(["standard", "mockup-forward", "standard"]);
  });

  it("still varies when the model names nothing at all", async () => {
    const got = await layoutsOf([undefined, undefined, undefined, undefined]);
    for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
  });
});
