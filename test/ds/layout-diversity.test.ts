import { describe, it, expect } from "vitest";
import { enforceLayoutDiversity } from "@/lib/ai/generate";
import type { SlidePlan, Slide } from "@/lib/ds/schema";

/** Build a minimal valid point slide with a given mockup type and optional layout/note. */
function point(
  mockupType: string,
  opts: { layout?: string; body?: string; note?: string } = {}
): Slide {
  const mockup: any = { type: mockupType };
  if (mockupType === "flow") {
    mockup.steps = [{ label: "A" }, { label: "B" }, { label: "C" }];
    if (opts.note) mockup.note = opts.note;
  } else if (mockupType === "terminal") {
    mockup.filename = "test.ts";
    mockup.lines = [{ text: "console.log(1)", style: "plain" }];
  } else if (mockupType === "concept") {
    mockup.parent = "X";
    mockup.children = ["A", "B"];
    if (opts.note) mockup.note = opts.note;
  } else if (mockupType === "hub") {
    mockup.center = "X";
    mockup.tools = [{ icon: "zap", label: "A" }, { icon: "zap", label: "B" }, { icon: "zap", label: "C" }];
    if (opts.note) mockup.note = opts.note;
  } else if (mockupType === "checklist") {
    mockup.items = ["A", "B", "C"];
    if (opts.note) mockup.note = opts.note;
  } else if (mockupType === "card") {
    mockup.icon = "sparkles";
    mockup.title = "Test";
    mockup.body = "Body text";
    mockup.tone = "peach";
  } else if (mockupType === "comparison") {
    mockup.loserLabel = "Bad";
    mockup.loserLine = "no";
    mockup.winnerLabel = "Good";
    mockup.winnerLine = "yes";
  } else if (mockupType === "database") {
    mockup.tables = [
      { name: "users", rows: [{ col: "id", type: "uuid" }, { col: "name", type: "text" }] },
      { name: "posts", rows: [{ col: "id", type: "uuid" }, { col: "user_id", type: "fk" }] },
    ];
  } else if (mockupType === "foldertree") {
    mockup.lines = [{ text: "src/" }, { text: "  index.ts", active: true }, { text: "  lib/" }];
  } else if (mockupType === "callout") {
    mockup.icon = "sparkles";
    mockup.text = "Important!";
  } else if (mockupType === "bigstat") {
    mockup.number = "42";
    mockup.caption = "items";
  }

  return {
    role: "point",
    counter: "02 / 08",
    eyebrow: "TEST",
    headline: "Test headline here",
    accentWord: "headline",
    body: opts.body ?? "This is the body text for testing purposes.",
    layout: (opts.layout ?? "standard") as any,
    mockup,
  } as Slide;
}

function plan(slides: Slide[]): SlidePlan {
  return {
    title: "Test Plan",
    caption: "Test caption.\n\n• One.\n\nSave it.",
    hashtags: ["fyp", "backend", "test", "coding", "vourdev"],
    slides: [
      { role: "cover", eyebrow: "TEST", headline: "Test cover", accentWord: "Test" } as Slide,
      ...slides,
      {
        role: "outro",
        headline: "Done",
        accentWord: "Done",
        cta: { strong: "Save & share" },
      } as Slide,
    ],
  };
}

describe("enforceLayoutDiversity", () => {
  it("leaves plans with <3 point slides unchanged", () => {
    const p = plan([
      point("flow", { layout: "standard" }),
      point("terminal", { layout: "standard" }),
    ]);
    const result = enforceLayoutDiversity(p);
    const points = result.slides.filter((s) => s.role === "point");
    // With only 2 points, no enforcement kicks in
    expect(points.every((s) => s.layout === "standard")).toBe(true);
  });

  it("redistributes when all layouts are identical (≥3 points)", () => {
    const p = plan([
      point("concept", { layout: "standard" }),
      point("terminal", { layout: "standard" }),
      point("flow", { layout: "standard", note: "important" }),
      point("hub", { layout: "standard" }),
      point("card", { layout: "standard", body: "Short" }),
      point("checklist", { layout: "standard" }),
    ]);
    const result = enforceLayoutDiversity(p);
    const pointLayouts = result.slides
      .filter((s) => s.role === "point")
      .map((s) => (s as any).layout || "standard");

    const unique = new Set(pointLayouts);
    // Must have at least 2 different layouts
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("does not modify plans that already have sufficient variety", () => {
    const p = plan([
      point("concept", { layout: "standard" }),
      point("terminal", { layout: "mockup-forward" }),
      point("flow", { layout: "split-content" }),
      point("card", { layout: "standard" }),
    ]);
    const result = enforceLayoutDiversity(p);
    const pointLayouts = result.slides
      .filter((s) => s.role === "point")
      .map((s) => (s as any).layout);

    expect(pointLayouts).toEqual(["standard", "mockup-forward", "split-content", "standard"]);
  });

  it("breaks runs of 3+ consecutive same layouts", () => {
    const p = plan([
      point("concept", { layout: "mockup-forward" }),
      point("terminal", { layout: "mockup-forward" }),
      point("flow", { layout: "mockup-forward" }),
      point("card", { layout: "standard" }),
    ]);
    const result = enforceLayoutDiversity(p);
    const pointLayouts = result.slides
      .filter((s) => s.role === "point")
      .map((s) => (s as any).layout || "standard");

    // Should NOT have 3 consecutive mockup-forward
    let maxRun = 0;
    let run = 1;
    for (let i = 1; i < pointLayouts.length; i++) {
      if (pointLayouts[i] === pointLayouts[i - 1]) run++;
      else run = 1;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBeLessThan(3);
  });

  it("assigns mockup-forward to hero mockup types when redistributing", () => {
    const p = plan([
      point("card", { layout: "standard" }),
      point("terminal", { layout: "standard" }),  // hero type, index 1 (% 3 === 1)
      point("flow", { layout: "standard" }),
      point("card", { layout: "standard" }),
      point("database", { layout: "standard" }),  // hero type, index 4 (% 3 === 1)
    ]);
    const result = enforceLayoutDiversity(p);
    const pointSlides = result.slides.filter((s) => s.role === "point");

    // terminal at pointIndex 1 should get mockup-forward
    expect((pointSlides[1] as any).layout).toBe("mockup-forward");
    // database at pointIndex 4 should get mockup-forward
    expect((pointSlides[4] as any).layout).toBe("mockup-forward");
  });

  it("does not touch cover or outro slides", () => {
    const p = plan([
      point("concept", { layout: "standard" }),
      point("terminal", { layout: "standard" }),
      point("flow", { layout: "standard" }),
    ]);
    const result = enforceLayoutDiversity(p);

    expect(result.slides[0].role).toBe("cover");
    expect(result.slides[result.slides.length - 1].role).toBe("outro");
    // cover and outro should not have layout field added
    expect((result.slides[0] as any).layout).toBeUndefined();
  });
});
