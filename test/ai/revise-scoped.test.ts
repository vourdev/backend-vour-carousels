import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { reviseSlidePlanScoped } from "@/lib/ai/generate";
import { RevisionScopeViolation } from "@/lib/ai/revision-scope";
import type { SlidePlan, Slide } from "@/lib/ds/schema";

const result = (text: string) =>
  ({
    finishReason: { unified: "stop" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
    content: [{ type: "text", text }],
    warnings: [],
  }) as unknown as LanguageModelV4GenerateResult;

/**
 * A model that answers from a queue. Each entry is the JSON the model "returns" for the
 * next call, so a test spells out exactly what the model does — including doing the
 * wrong thing, which is the case that matters here.
 */
function scriptedModel(responses: unknown[]) {
  let i = 0;
  const seen: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options: { prompt: unknown }) => {
      seen.push(JSON.stringify(options.prompt));
      const next = responses[Math.min(i, responses.length - 1)];
      i++;
      return result(JSON.stringify(next));
    },
  });
  return { model, seen, calls: () => i };
}

type PointSlide = Extract<Slide, { role: "point" }>;

const point = (n: number): PointSlide => ({
  role: "point",
  counter: `0${n} / 08`,
  eyebrow: `E${n}`,
  headline: `Headline ${n}`,
  accentWord: "Headline",
  body: `Body ${n}`,
  mockup: { type: "callout", icon: "zap", text: `Callout ${n}` },
});

const basePlan = (): SlidePlan => ({
  title: "Race Condition di Node.js",
  caption: "Caption asli.\n\nSimpan biar nggak lupa!",
  hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
  slides: [
    { role: "cover", eyebrow: "BACKEND", headline: "Race condition", accentWord: "Race" },
    point(2),
    point(3),
    point(4),
    point(5),
    point(6),
    point(7),
    { role: "outro", eyebrow: "TUTUP", headline: "Simpan ini", accentWord: "Simpan", cta: { strong: "Simpan" } },
  ],
});

/** Everything except the named slides and globals, as a comparable snapshot. */
function outside(plan: SlidePlan, slideIdx: number[], globals: string[] = []) {
  return JSON.stringify({
    title: globals.includes("title") ? null : plan.title,
    caption: globals.includes("caption") ? null : plan.caption,
    hashtags: globals.includes("hashtags") ? null : plan.hashtags,
    slides: plan.slides.map((s, i) => (slideIdx.includes(i) ? null : s)),
  });
}

describe("reviseSlidePlanScoped — targeted patching", () => {
  it("changes only the named slide", async () => {
    const before = basePlan();
    const { model, calls } = scriptedModel([
      { slides: [{ index: 2, slide: { ...point(2), headline: "Pendek" } }] },
    ]);

    const { plan: after, scope, changed } = await reviseSlidePlanScoped(before, "perpendek headline slide 2", model);

    expect(scope.resolved).toBe(true);
    expect(scope.slides).toEqual([1]);
    expect(changed).toEqual(["slide 2"]);
    expect(after.slides[1].headline).toBe("Pendek");
    expect(outside(after, [1])).toBe(outside(before, [1]));
    // Scope came from the regex, so no classifier call was needed.
    expect(calls()).toBe(1);
  });

  it("supports swapping a slide's mockup type, and it is not a no-op", async () => {
    const before = basePlan();
    const swapped: Slide = {
      ...point(4),
      mockup: { type: "illustration", illustrationSlugs: ["server-error_syuz"] },
    };
    const { model } = scriptedModel([{ slides: [{ index: 4, slide: swapped }] }]);

    const { plan: after, changed } = await reviseSlidePlanScoped(
      before,
      "ganti mockup slide 4 jadi illustration",
      model
    );

    expect(changed).toEqual(["slide 4"]);
    const mockup = after.slides[3].role === "point" ? after.slides[3].mockup : undefined;
    expect(mockup?.type).toBe("illustration");
    expect(mockup).toMatchObject({ illustrationSlugs: ["server-error_syuz"] });
    expect(outside(after, [3])).toBe(outside(before, [3]));
  });

  it("revises the caption without touching anything else", async () => {
    const before = basePlan();
    const { model } = scriptedModel([{ caption: "Caption baru yang lebih pendek." }]);

    const { plan: after, scope, changed } = await reviseSlidePlanScoped(before, "captionnya bikin lebih pendek", model);

    expect(scope.globals).toEqual(["caption"]);
    expect(changed).toEqual(["caption"]);
    expect(after.caption).toBe("Caption baru yang lebih pendek.");
    expect(outside(after, [], ["caption"])).toBe(outside(before, [], ["caption"]));
  });

  it("revises the title and hashtags when those are what was asked for", async () => {
    const before = basePlan();
    const { model } = scriptedModel([
      { title: "Judul Baru", hashtags: ["fyp", "nodejs", "concurrency", "backend", "vourdev"] },
    ]);

    const { plan: after } = await reviseSlidePlanScoped(before, "ganti judul dan hashtagnya", model);

    expect(after.title).toBe("Judul Baru");
    expect(after.hashtags).toContain("concurrency");
    expect(after.slides).toEqual(before.slides);
    expect(after.caption).toBe(before.caption);
  });

  it("patches a slide and a global in the same turn", async () => {
    const before = basePlan();
    // Slide call and global call run in parallel; the mock answers both from its queue,
    // so accept either order by keying off the shape.
    const { model } = scriptedModel([
      { slides: [{ index: 3, slide: { ...point(3), body: "Body 3 tanpa typo" } }] },
      { caption: "Caption baru." },
    ]);

    const { plan: after } = await reviseSlidePlanScoped(before, "perbaiki typo slide 3 dan captionnya", model);

    expect(after.slides[2].role === "point" && after.slides[2].body).toBe("Body 3 tanpa typo");
    expect(outside(after, [2], ["caption"])).toBe(outside(before, [2], ["caption"]));
  });

  it("ignores a slide the model returned that was not in scope", async () => {
    const before = basePlan();
    const { model } = scriptedModel([
      {
        slides: [
          { index: 2, slide: { ...point(2), headline: "Pendek" } },
          // The model also "helpfully" rewrote slide 6. This is exactly the drift the
          // old whole-plan flow accepted without noticing.
          { index: 6, slide: { ...point(6), headline: "Diam-diam diubah" } },
        ],
      },
    ]);

    const { plan: after } = await reviseSlidePlanScoped(before, "perpendek headline slide 2", model);

    expect(after.slides[5]).toEqual(before.slides[5]);
    expect(outside(after, [1])).toBe(outside(before, [1]));
  });

  it("reports a no-op when the model returns the slide unchanged", async () => {
    const before = basePlan();
    const { model } = scriptedModel([{ slides: [{ index: 2, slide: before.slides[1] }] }]);

    const { changed } = await reviseSlidePlanScoped(before, "perpendek headline slide 2", model);
    expect(changed).toEqual([]);
  });

  it("falls back to whole-plan revision for a structural request", async () => {
    const before = basePlan();
    const whole: SlidePlan = { ...before, slides: [...before.slides, point(9)] };
    const { model } = scriptedModel([whole]);

    const { plan: after, scope } = await reviseSlidePlanScoped(before, "tambahkan slide baru soal testing", model);

    expect(scope.resolved).toBe(false);
    expect(scope.reasonCode).toBe("structural");
    expect(after.slides.length).toBe(9);
  });

  it("asks the classifier only when the request names no target", async () => {
    const before = basePlan();
    const { model, calls } = scriptedModel([
      // 1st call: the classifier.
      { slides: [3], globals: [], wholeDeck: false },
      // 2nd call: the scoped slide edit.
      { slides: [{ index: 3, slide: { ...point(3), body: "Lebih jelas" } }] },
    ]);

    const { plan: after, scope } = await reviseSlidePlanScoped(before, "bagian soal overlap kurang jelas", model);

    expect(scope.source).toBe("classified");
    expect(scope.slides).toEqual([2]);
    expect(calls()).toBe(2);
    expect(outside(after, [2])).toBe(outside(before, [2]));
  });
});

describe("reviseSlidePlanScoped — a long session does not drift", () => {
  it("survives 10 consecutive revisions with every untouched field intact", async () => {
    const original = basePlan();
    let plan = original;
    const history: { request: string; outcome?: string | null }[] = [];

    // Ten turns, each hitting a different slide, round-robin over the six point slides.
    for (let turn = 1; turn <= 10; turn++) {
      const target = 1 + (turn % 6); // 0-based index of a point slide (1..6)
      const patched: Slide = { ...point(target + 1), body: `Body ${target + 1} rev ${turn}` };
      const { model } = scriptedModel([{ slides: [{ index: target + 1, slide: patched }] }]);

      const message = `perbaiki body slide ${target + 1}`;
      const out = await reviseSlidePlanScoped(plan, message, model, history);

      expect(out.scope.slides, message).toEqual([target]);
      expect(out.changed, message).toEqual([`slide ${target + 1}`]);
      // Everything outside this turn's slide is byte-identical to the turn before.
      expect(outside(out.plan, [target]), `turn ${turn}`).toBe(outside(plan, [target]));

      history.push({ request: message, outcome: `slide ${target + 1}: body` });
      plan = out.plan;
    }

    // After ten turns the deck-level fields and the never-targeted slides (cover, outro)
    // are still exactly what they were before turn 1.
    expect(plan.title).toBe(original.title);
    expect(plan.caption).toBe(original.caption);
    expect(plan.hashtags).toEqual(original.hashtags);
    expect(plan.slides[0]).toEqual(original.slides[0]);
    expect(plan.slides[7]).toEqual(original.slides[7]);
    expect(plan.slides.length).toBe(original.slides.length);
  });

  it("runs the three-revision sequence from the brief without collateral change", async () => {
    const original = basePlan();

    const steps: { message: string; response: unknown; slide: number }[] = [
      {
        message: "perpendek headline slide 2",
        response: { slides: [{ index: 2, slide: { ...point(2), headline: "Dua request, satu saldo" } }] },
        slide: 1,
      },
      {
        message: "ganti mockup slide 4 jadi illustration",
        response: {
          slides: [
            {
              index: 4,
              slide: { ...point(4), mockup: { type: "illustration", illustrationSlugs: ["server-error_syuz"] } },
            },
          ],
        },
        slide: 3,
      },
      {
        message: "perbaiki typo slide 6",
        response: { slides: [{ index: 6, slide: { ...point(6), body: "Body 6 sudah benar" } }] },
        slide: 5,
      },
    ];

    let plan = original;
    const history: { request: string; outcome?: string | null }[] = [];
    for (const step of steps) {
      const { model } = scriptedModel([step.response]);
      const out = await reviseSlidePlanScoped(plan, step.message, model, history);
      expect(out.changed, step.message).toEqual([`slide ${step.slide + 1}`]);
      expect(outside(out.plan, [step.slide]), step.message).toBe(outside(plan, [step.slide]));
      history.push({ request: step.message, outcome: "ok" });
      plan = out.plan;
    }

    expect(plan.title).toBe(original.title);
    expect(plan.caption).toBe(original.caption);
    expect(plan.hashtags).toEqual(original.hashtags);
    expect(plan.slides[1].headline).toBe("Dua request, satu saldo");
    const m = plan.slides[3].role === "point" ? plan.slides[3].mockup : undefined;
    expect(m?.type).toBe("illustration");
    expect(plan.slides[5].role === "point" && plan.slides[5].body).toBe("Body 6 sudah benar");
    // The three slides nobody asked about are untouched, by identity.
    expect(plan.slides[0]).toBe(original.slides[0]);
    expect(plan.slides[2]).toBe(original.slides[2]);
    expect(plan.slides[4]).toBe(original.slides[4]);
    expect(plan.slides[6]).toBe(original.slides[6]);
    expect(plan.slides[7]).toBe(original.slides[7]);
  });
});

describe("RevisionScopeViolation", () => {
  it("names every field that moved", () => {
    const err = new RevisionScopeViolation(
      { slides: [1], globals: [], resolved: true, source: "parsed" },
      ["caption changed", "slide 5 changed"]
    );
    expect(err.message).toContain("slide 2");
    expect(err.message).toContain("caption changed");
    expect(err.violations).toHaveLength(2);
  });
});
