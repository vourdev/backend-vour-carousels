import { describe, it, expect } from "vitest";
import { carouselExtraCss } from "@/lib/ds/carousel-css-extra";
import { renderSlide } from "@/lib/ds/render-slide";
import { repairSlidePlan } from "@/lib/ds/repair";
import { bigstatTemplate } from "@/lib/ds/templates/bigstat";
import { calloutTemplate } from "@/lib/ds/templates/callout";
import { gitBranchTemplate } from "@/lib/ds/templates/gitbranch";

/**
 * Guards the Paper/Ink split.
 *
 * Every dark-surface rule in carousel-css-extra.ts used to be written as
 * `body section .x`, which also matches a `section.paper`. Cream slides were
 * therefore handed dark-surface mockups (hub/concept/flow nodes, datatable
 * rules, steps, quote, browser, …). Paper is now defined as the ABSENCE of
 * these rules — it falls through to the DO-NOT-EDIT base in carousel-css.ts —
 * so an unscoped `body section` selector is a bug, not a style choice.
 */
describe("paper/ink surface parity", () => {
  it("scopes every deck-wide rule to :not(.paper)", () => {
    const offenders = carouselExtraCss
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      // Selector lines only: skip declarations, comments, and closing braces.
      .filter(({ line }) => line.startsWith("body section"))
      .filter(({ line }) => !line.includes(":not(.paper)"))
      // Layout-only, deliberately surface-independent (stacking context).
      .filter(({ line }) => !line.startsWith("body section > *"))
      // The second LIGHT surface. This rule is the inverse of what the guard is for:
      // it can only ever match a paper slide, and it overrides background alone.
      .filter(({ line }) => !line.startsWith("body section.paper.warm"));

    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });

  it("no longer keeps a second copy of the cream palette", () => {
    // A `body section.paper` reset block is what drifted out of sync with the
    // ink rules in the first place; paper must come from the base stylesheet.
    // `.paper.warm` is the one allowed descendant, and only for the background.
    expect(carouselExtraCss).not.toMatch(/body section\.paper\s*\{/);
    const warm = carouselExtraCss.split("body section.paper.warm {")[1]?.split("}")[0] ?? "";
    expect(warm).toContain("background:");
    expect(warm.match(/^\s*[a-z-]+:/gm)?.map((d) => d.trim())).toEqual(["background:"]);
  });
});

/**
 * The other direction.
 *
 * The guard above stops dark rules leaking onto cream. This one stops the reverse: a
 * mockup styled only for cream, with no Ink counterpart, renders near-black text on a
 * near-black slide. Both cases below shipped that way and nobody saw them, because
 * neither mockup type was reachable from the category table in the plan prompt until
 * the routing table was completed — so no plan could ever select one.
 */
describe("every light-surface text rule has an ink counterpart", () => {
  const NEEDS_INK_VARIANT = [
    [".diag-screenshot-badge", "screenshot placeholder badge"],
    [".diag-screenshot-source", "screenshot placeholder target line"],
    [".diag-screenshot-brief-item", "screenshot placeholder brief rows"],
    [".lc-bar-wrap.highlight .lc-label", "latencycomp winning row label"],
    [".lc-bar-wrap.highlight .lc-value", "latencycomp winning row value"],
    [".dec-name", "decision option name"],
    [".dec-when", "decision condition text"],
    [".mf-fact .mf-text", "mythfact correction text"],
    [".pf-text", "pitfalls row text"],
  ] as const;

  for (const [selector, what] of NEEDS_INK_VARIANT) {
    it(`re-scopes ${what} for Ink`, () => {
      expect(carouselExtraCss).toContain(`section:not(.paper) ${selector}`);
    });
  }
});

describe("surface tokens reach the places CSS cannot", () => {
  // An inline style or an SVG presentation attribute cannot be re-scoped per
  // surface, so a literal ink/paper hex there is permanently wrong on one of the
  // two surfaces. These three templates each shipped one.
  const TOKEN_ONLY = [
    ["bigstat", bigstatTemplate],
    ["callout", calloutTemplate],
    ["gitbranch", gitBranchTemplate],
  ] as const;

  // Surface-dependent literals. Ember (#EE4B1A/#FF6A3D) reads on both surfaces
  // and is allowed; these do not.
  const SURFACE_BOUND_HEX = /#(1C0A05|14110E|F7F1E8|FBF6EF|FFFDF9|1F1A15|6E4B3E|3D2419|A48C7E)/i;

  it.each(TOKEN_ONLY)("%s names no surface-bound colour", (_name, tpl) => {
    expect(tpl).not.toMatch(SURFACE_BOUND_HEX);
  });

  it("defines every token on both surfaces", () => {
    const names = [
      "--ms-fg", "--ms-fg-muted", "--ms-fg-faint",
      "--ms-panel", "--ms-panel-deep", "--ms-line", "--ms-accent",
      "--ms-invert-bg", "--ms-invert-fg", "--ms-invert-chip",
    ];
    const inkBlock = carouselExtraCss.split("body section:not(.paper) {")[1]?.split("}")[0] ?? "";
    for (const n of names) {
      // Paper default (bare `section {}`) plus an Ink re-binding.
      expect(carouselExtraCss.match(new RegExp(`${n}:`, "g"))?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(inkBlock).toContain(`${n}:`);
    }
  });

  it("keeps an always-dark device off an ink slide", () => {
    // Prompted, but not trusted: a terminal on Ink is near-black on near-black.
    const plan = repairSlidePlan({
      title: "t", caption: "", hashtags: [],
      slides: [{
        role: "point", counter: "1/1", eyebrow: "E", headline: "H", body: "b",
        surface: "ink",
        mockup: { type: "terminal", filename: "a.ts", lines: [{ text: "x", style: "plain" }] },
      }],
    });
    expect((plan.slides[0] as { surface?: string }).surface).toBe("paper");
  });

  it("leaves a surface-following mockup on the ink slide it was given", () => {
    const plan = repairSlidePlan({
      title: "t", caption: "", hashtags: [],
      slides: [{
        role: "point", counter: "1/1", eyebrow: "E", headline: "H", body: "b",
        surface: "ink",
        mockup: { type: "callout", icon: "sparkles", text: "hi" },
      }],
    });
    expect((plan.slides[0] as { surface?: string }).surface).toBe("ink");
  });
});

describe("mockup fit on the fixed canvas", () => {
  it("wraps the checklist in the flex slot so it centers and cannot overrun", () => {
    const html = renderSlide({
      role: "point", counter: "1/1", eyebrow: "RECAP", headline: "H", body: "b",
      mockup: { type: "checklist", items: ["a", "b", "c", "d", "e", "f"] },
    });
    expect(html).toContain('<div class="diag-wrap');
    expect(html).toContain('<ul class="checklist"');
  });

  it("glues each flow arrow to the node it points at so wrapped rows read right", () => {
    const html = renderSlide({
      role: "point", counter: "1/1", eyebrow: "ALUR", headline: "H", body: "b",
      mockup: {
        type: "flow",
        steps: [{ label: "Client" }, { label: "API", focus: true }, { label: "DB" }],
      },
    });
    // First node bare, every later node carries its own leading arrow.
    expect(html.match(/class="flow-step"/g)).toHaveLength(2);
    expect(html).toContain('<div class="flow-step"><span class="arrow">→</span><div class="node');
    // No free-standing arrow left to dangle at the end of a wrapped row.
    expect(html).not.toContain('<div class="arrow">');
  });

  it("lets the flow row wrap instead of overflowing the content box", () => {
    expect(carouselExtraCss).toMatch(/\.diag-flow\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(carouselExtraCss).toMatch(/\.diag-flow \.node\s*\{[^}]*white-space:\s*normal/);
  });
});
