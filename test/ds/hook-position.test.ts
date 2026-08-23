import { describe, it, expect } from "vitest";
import {
  renderSlide,
  resolveLayout,
  NARROW_SAFE_MOCKUPS,
  NOTE_BEARING_MOCKUPS,
} from "@/lib/ds/render-slide";
import { carouselCss } from "@/lib/ds/carousel-css";
import { carouselExtraCss } from "@/lib/ds/carousel-css-extra";
import type { Mockup } from "@/lib/ds/schema";

/**
 * The hook rule: eyebrow + headline are the reason a thumb stops scrolling, so at most
 * ONE content block may render above them — whichever composition the plan picked.
 *
 * A slide "Selalu Validasi Pakai EXPLAIN" shipped reading checklist → catatan → eyebrow
 * → headline → body: two blocks above the hook, with the headline starting 930px down a
 * 1350px canvas. The markup was correct both times it regressed; the ordering was not.
 * `mockup-forward` had pinned `.catatan` to the mockup's flex slot, which is ahead of the
 * hook, so the note the mockup was supposed to *conclude* introduced it instead.
 *
 * These assertions cover the authored contract. They cannot see specificity or a grid
 * override winning over a flex slot — `npm run check:layout` measures the real geometry
 * in a browser for that, across every note-bearing mockup × every composition.
 */

/** `selector { … order: N … }` pairs, comments stripped so braces inside prose are ignored. */
function orderRules(css: string): Array<{ selector: string; order: number }> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Array<{ selector: string; order: number }> = [];
  for (const [, selector, body] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const hit = /(?:^|;)\s*order\s*:\s*(-?\d+)/.exec(body);
    if (hit) rules.push({ selector: selector.trim().replace(/\s+/g, " "), order: Number(hit[1]) });
  }
  return rules;
}

const RULES = orderRules(carouselCss + carouselExtraCss);
const slot = (target: string) =>
  RULES.find((r) => r.selector === `section.slide-point > ${target}`)?.order;

describe("point slide reading order", () => {
  // Without this class the shared slots select nothing and every composition silently
  // falls back to raw DOM order — the renderer's layout choice stops meaning anything.
  it("stamps .slide-point on every point slide", () => {
    const html = renderSlide({
      role: "point", counter: "1/1", eyebrow: "E", headline: "H", body: "B",
      mockup: { type: "checklist", items: ["a", "b"], note: "N" },
    });
    expect(html).toContain("slide-point");
  });

  it("gives every block a slot", () => {
    for (const target of [".counter", ".eyebrow", "h1.compact", ".body-text", ".diag-wrap", ".card", ".catatan"]) {
      expect(slot(target), `no slot for ${target}`).toBeTypeOf("number");
    }
  });

  // The note is support copy: it explains a conclusion the headline has already made.
  it("puts the note last, behind every other block", () => {
    const others = [".counter", ".eyebrow", "h1.compact", ".body-text", ".diag-wrap", ".card"].map(slot);
    for (const other of others) expect(slot(".catatan")!).toBeGreaterThan(other!);
  });

  // TASK 2's hard rule, stated as something a future edit has to trip over: a composition
  // may move the *mockup* above the hook, never the note. Re-slotting `.catatan` per
  // layout is exactly how this broke, so no rule outside the shared block may set it.
  it("lets no composition re-slot the note", () => {
    const reslotted = RULES.filter(
      (r) => r.selector.includes(".catatan") && r.selector !== "section.slide-point > .catatan"
    );
    expect(reslotted).toEqual([]);
  });

  // TASK 3: one block above the hook, not two. Enforced by there being a single slot
  // ahead of the eyebrow, claimed only by the two mutually exclusive visual blocks —
  // renderSlide fills either {{#card}} or MOCKUP_INJECT, never both.
  it("keeps exactly one slot ahead of the hook, for the visual only", () => {
    const preHook = RULES.filter((r) => r.order < slot(".eyebrow")! && r.order !== slot(".counter")!);
    expect(new Set(preHook.map((r) => r.order)).size).toBe(1);
    for (const rule of preHook) {
      expect(rule.selector).toMatch(/(\.diag-wrap|\.card)$/);
    }
  });

  // A slot rule that ties with the override loses on source order and the composition
  // silently degrades to "standard" — which is how the first fix here rendered.
  it("names both classes on a composition override so it outranks the shared slot", () => {
    const overrides = RULES.filter((r) => r.selector.includes("layout-"));
    expect(overrides.length).toBeGreaterThan(0);
    for (const rule of overrides) {
      expect(rule.selector).toMatch(/^section\.slide-point\.layout-/);
    }
  });
});

/**
 * The two conditional compositions are advertised to the model by type name, straight out
 * of these sets (see LAYOUT_RULE in lib/ai/prompts.ts). A name in a set that resolveLayout
 * then degrades is worse than no recommendation at all: the model spends one of the deck's
 * layout slots on a composition it never gets, and the deck comes out monotone while every
 * slide reports a different layout.
 */
const NOTED: Record<string, Mockup> = {
  flow: { type: "flow", steps: [{ label: "A" }, { label: "B" }], note: "N" },
  concept: { type: "concept", parent: "P", children: ["a", "b"], note: "N" },
  hub: { type: "hub", center: "C", tools: [{ icon: "database", label: "a" }, { icon: "search", label: "b" }], note: "N" },
  checklist: { type: "checklist", items: ["a", "b"], note: "N" },
  browser: { type: "browser", url: "u", cards: [{ label: "a", value: "1" }, { label: "b", value: "2" }], note: "N" },
  commandlist: { type: "commandlist", rows: [{ cmd: "a", desc: "x" }, { cmd: "b", desc: "y" }], note: "N" },
  latencycomp: { type: "latencycomp", items: [{ label: "a", value: "1ms", percentage: 10 }, { label: "b", value: "2ms", percentage: 100 }], note: "N" },
  decision: { type: "decision", options: [{ name: "a", when: "x" }, { name: "b", when: "y" }], note: "N" },
  pitfalls: { type: "pitfalls", items: [{ text: "a" }, { text: "b" }, { text: "c" }], note: "N" },
  comparison: { type: "comparison", loserLabel: "l", loserLine: "x", winnerLabel: "w", winnerLine: "y", winnerRationale: "N" },
  illustration: { type: "illustration", illustrationSlugs: ["learning_qt7d"], caption: "N" },
};

const NARROW: Record<string, Mockup> = {
  card: { type: "card", icon: "database", title: "t", body: "b", tone: "peach" },
  callout: { type: "callout", icon: "database", text: "t" },
  quote: { type: "quote", quote: "q" },
  bigstat: { type: "bigstat", number: "3x", caption: "c" },
  checklist: NOTED.checklist,
  illustration: NOTED.illustration,
  promptcard: { type: "promptcard", body: "p" },
  concept: NOTED.concept,
};

describe("conditional compositions match what the prompt advertises", () => {
  it("covers every advertised type with a fixture", () => {
    expect(Object.keys(NOTED).sort()).toEqual([...NOTE_BEARING_MOCKUPS].sort());
    expect(Object.keys(NARROW).sort()).toEqual([...NARROW_SAFE_MOCKUPS].sort());
  });

  it("honours note-emphasis on every note-bearing type", () => {
    for (const [name, mockup] of Object.entries(NOTED)) {
      expect(resolveLayout("note-emphasis", 0, mockup), name).toBe("note-emphasis");
    }
  });

  // Every fixture here is a one-character placeholder, so each is paired with a realistic
  // body: split-content is now gated on how much copy the slide carries as well as on the
  // mockup type, and a two-word slide legitimately fails that gate.
  const REAL_BODY =
    "Satu poin kelewat, workflow lo berisiko gagal diam-diam tanpa ada alert yang masuk.";

  it("honours split-content on every narrow-safe type", () => {
    for (const [name, mockup] of Object.entries(NARROW)) {
      expect(resolveLayout("split-content", 0, mockup, REAL_BODY), name).toBe("split-content");
    }
  });

  // Two columns need enough to put in them. Below the threshold the composition reserves
  // the whole canvas for a handful of words, so a single column is the better shape.
  it("degrades split-content when there is barely any copy", () => {
    const thin: Mockup = { type: "checklist", items: ["a", "b"] };
    expect(resolveLayout("split-content", 0, thin, "B")).toBe("standard");
    expect(resolveLayout(undefined, 0, thin, "B")).toBe("standard");

    // And honours it again as soon as the slide is actually carrying something.
    const full: Mockup = { type: "checklist", items: ["a", "b", "c", "d"] };
    expect(resolveLayout("split-content", 0, full, REAL_BODY)).toBe("split-content");
  });

  // The degrade path is what makes an over-broad recommendation invisible rather than loud.
  it("still degrades a type outside the sets", () => {
    const terminal: Mockup = { type: "terminal", filename: "a.ts", lines: [{ text: "x" }] };
    expect(resolveLayout("note-emphasis", 0, terminal)).toBe("standard");
    expect(resolveLayout("split-content", 0, terminal)).toBe("standard");
  });
});
