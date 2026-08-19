import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { carouselCss } from "@/lib/ds/carousel-css";
import { carouselExtraCss } from "@/lib/ds/carousel-css-extra";
import { stripEmoji } from "@/lib/ds/strip-emoji";
import { renderSlide } from "@/lib/ds/render-slide";
import {
  VOUR_BLACK,
  VOUR_CHARCOAL,
  VOUR_INK_PANEL,
  VOUR_CODE,
  VOUR_MIST,
  VOUR_NEGATIVE,
  VOUR_NEGATIVE_ON_DARK,
  VOUR_ORANGE,
  VOUR_ORANGE_BRIGHT,
  VOUR_ORANGE_DEEP,
  VOUR_ORANGE_WASH,
  VOUR_POSITIVE,
  VOUR_POSITIVE_ON_DARK,
  VOUR_SLATE,
  VOUR_SLATE_FAINT,
  VOUR_SLATE_SOFT,
  VOUR_TONES,
  VOUR_WHITE,
  VOUR_PAPER,
} from "@/lib/ds/tokens";

const CSS = carouselCss + carouselExtraCss;

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const expand = (hex: string) =>
  hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;

function chroma(hex: string): number {
  const c = hex.replace("#", "");
  const v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return Math.max(...v) - Math.min(...v);
}

describe("Vour palette contrast", () => {
  it("uses a primary accent on light surfaces that passes AA on ALL of them", () => {
    for (const surface of [VOUR_WHITE, VOUR_MIST, VOUR_PAPER]) {
      expect(contrast(VOUR_ORANGE_DEEP, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("rejects the lighter oranges that were considered for light surfaces", () => {
    // Guards the decision, not the code. The first of these is the brand orange itself:
    // it was the light-surface accent TEXT before the teal rebrand and it never passed.
    // If someone "restores" VOUR_ORANGE_DEEP toward it, the check above fails and this
    // says by how much.
    expect(contrast(VOUR_ORANGE, VOUR_PAPER)).toBeLessThan(4.5); // 3.30
    expect(contrast("#D8420F", VOUR_PAPER)).toBeLessThan(4.5); // 3.83
    expect(contrast("#CC3D0E", VOUR_PAPER)).toBeLessThan(4.5); // 4.25
    expect(contrast("#C43A0C", VOUR_TONES.amber.bg)).toBeLessThan(4.5); // 4.34 on the amber card
  });

  it("keeps the brand ember off every SMALL label on a light surface", () => {
    // The size rule, enforced. Any rule that both names a font-size under 24px and sets
    // the brand value as its colour is the AA failure the legacy system shipped.
    const offenders: string[] = [];
    for (const block of CSS.match(/[^{}]+\{[^}]*\}/g) ?? []) {
      if (!new RegExp(`color:\\s*${VOUR_ORANGE}`, "i").test(block)) continue;
      const size = block.match(/font-size:\s*(\d+)px/);
      if (size && Number(size[1]) < 24) offenders.push(block.trim().slice(0, 70));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the dark-surface accent clear of both dark surfaces", () => {
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_BLACK)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_CHARCOAL)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the two light-surface ember values doing different jobs", () => {
    // The whole reason there are two: the brand value is DISPLAY-only on light. If both
    // ever cleared 4.5, one of them is redundant and someone should delete it.
    expect(contrast(VOUR_ORANGE, VOUR_PAPER)).toBeGreaterThanOrEqual(3);
    expect(contrast(VOUR_ORANGE, VOUR_PAPER)).toBeLessThan(4.5);
    expect(contrast(VOUR_ORANGE_DEEP, VOUR_PAPER)).toBeGreaterThanOrEqual(4.5);
    // The pull-quote mark is decorative and 150px, so 3:1 is its bar on its own wash.
    expect(contrast(VOUR_ORANGE, VOUR_ORANGE_WASH)).toBeGreaterThanOrEqual(3);
  });

  it("keeps every neutral warm rather than leaving a cool ramp under a warm accent", () => {
    // r > b on every derived neutral. A cool grey under ember is the single change that
    // makes the palette read as a recolour instead of as a design.
    const warmer = (hex: string) => {
      const c = hex.replace("#", "");
      const [r, , b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
      return r > b;
    };
    for (const n of [VOUR_BLACK, VOUR_CHARCOAL, VOUR_MIST, VOUR_PAPER, VOUR_SLATE, VOUR_SLATE_SOFT, VOUR_SLATE_FAINT, VOUR_NEGATIVE])
      expect(warmer(n), n).toBe(true);
  });

  it("keeps the derived neutrals readable as the text tiers they are", () => {
    expect(contrast(VOUR_SLATE, VOUR_PAPER)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_SLATE_SOFT, VOUR_PAPER)).toBeGreaterThanOrEqual(4.5);
    // The faint tier is the one the legacy palette got wrong: #A48C7E is 2.82:1 here and
    // was carrying captions, table sub-labels and the counter.
    expect(contrast(VOUR_SLATE_FAINT, VOUR_PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#A48C7E", VOUR_PAPER)).toBeLessThan(3);
  });

  it("keeps body text at AAA on every surface it is used on", () => {
    expect(contrast(VOUR_BLACK, VOUR_MIST)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_BLACK, VOUR_WHITE)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_WHITE, VOUR_BLACK)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_WHITE, VOUR_CHARCOAL)).toBeGreaterThanOrEqual(7);
  });

  it("keeps every tone's ink readable on its own background", () => {
    for (const [name, tone] of Object.entries(VOUR_TONES)) {
      expect(contrast(tone.ink, tone.bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lets the primary accent carry copy on any tonal card", () => {
    // A card label or an accent word can land on any of the six. If one of them stops
    // clearing AA the tone is the thing that has to move, not the accent.
    for (const [name, tone] of Object.entries(VOUR_TONES)) {
      expect(contrast(VOUR_ORANGE_DEEP, tone.bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("exactly one accent exists, and every colour in the deck is accounted for", () => {
  /**
   * The guardrail behind the whole palette: the model never picks a colour, so every
   * chromatic value in the rendered CSS must be a token someone chose on purpose. This
   * is a whitelist rather than a hue rule — a hue rule has holes, and "one accent plus
   * six tones" is only a real constraint if something enumerates them.
   *
   * Near-neutrals (chroma < 12) are exempt: white and the panel darks. They carry no hue
   * to smuggle a second accent in with.
   */
  const ALLOWED = new Set(
    [
      // the accent, all three jobs
      VOUR_ORANGE,
      VOUR_ORANGE_BRIGHT,
      VOUR_ORANGE_DEEP,
      VOUR_ORANGE_WASH,
      // surfaces + derived neutrals that carry enough tint to count as chromatic
      VOUR_BLACK,
      VOUR_CHARCOAL,
      VOUR_INK_PANEL,
      VOUR_MIST,
      VOUR_PAPER,
      VOUR_SLATE,
      VOUR_SLATE_SOFT,
      VOUR_SLATE_FAINT,
      "#FDFBF6",
      "#F7F1E8", // cream text on dark, used only as an rgba() base
      // semantic pairs
      VOUR_NEGATIVE,
      VOUR_POSITIVE,
      VOUR_NEGATIVE_ON_DARK,
      VOUR_POSITIVE_ON_DARK,
      // terminal chrome + syntax — a quotation from another system, not a branded surface
      "#A0503A",
      "#C08A3A",
      ...Object.values(VOUR_CODE),
      // the six tonal cards
      ...Object.values(VOUR_TONES).flatMap((t) => [t.bg, t.ink]),
    ].map((h) => h.toLowerCase())
  );

  it("allows no chromatic hex in the carousel CSS outside the whitelist", () => {
    const hexes = [...new Set(CSS.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [])].map(expand);
    const strays = hexes.filter((h) => chroma(h) >= 12 && !ALLOWED.has(h.toLowerCase()));
    expect(strays).toEqual([]);
  });

  it("allows no chromatic rgb() triple outside the whitelist", () => {
    const strays: string[] = [];
    for (const m of CSS.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      if (chroma(hex) >= 12 && !ALLOWED.has(hex)) strays.push(m[0]);
    }
    expect(strays).toEqual([]);
  });

  it("keeps the three ember values inside one hue", () => {
    // They have to read as one colour used three ways, not as three oranges. Every value
    // sits within a few degrees of the brand hue.
    const hue = (hex: string) => {
      const c = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
      const mx = Math.max(r, g, b);
      const d = mx - Math.min(r, g, b);
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      return h < 0 ? h + 360 : h;
    };
    const base = hue(VOUR_ORANGE);
    for (const v of [VOUR_ORANGE_BRIGHT, VOUR_ORANGE_DEEP, VOUR_ORANGE_WASH])
      expect(Math.abs(hue(v) - base), v).toBeLessThan(15);
  });

  it("leaves no teal anywhere in slide content", () => {
    // Teal is the logo mark's colour and has no role in the deck. The mark is an image
    // asset, so nothing in the stylesheets should carry the hue at all.
    const hue = (hex: string) => {
      const c = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
      const mx = Math.max(r, g, b);
      const d = mx - Math.min(r, g, b);
      if (!d) return -1;
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      return h < 0 ? h + 360 : h;
    };
    const hexes = [...new Set(CSS.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [])].map(expand);
    const teals = hexes.filter((h) => chroma(h) >= 20 && hue(h) > 165 && hue(h) < 200);
    expect(teals).toEqual([]);
  });

  it("keeps the small-text ember out of the headline accent word", () => {
    // The headline accent is display size and gets the brand value. Swapping in the
    // deeper sibling there would quietly dull the one element the palette is named for.
    const accentRules = CSS.split("\n").filter((l) => /h1 \.a\b/.test(l));
    expect(accentRules.length).toBeGreaterThan(0);
    for (const rule of accentRules) {
      // Whichever surface it is scoped to, the value is a DISPLAY one.
      expect(rule.toLowerCase()).not.toContain(VOUR_ORANGE_DEEP.toLowerCase());
      expect(
        rule.toLowerCase().includes(VOUR_ORANGE.toLowerCase()) ||
          rule.toLowerCase().includes(VOUR_ORANGE_BRIGHT.toLowerCase())
      ).toBe(true);
    }
  });

  it("pins each accent value to the surface where it is legible", () => {
    // Ember bright is 2.30:1 on the binding cream; ember deep is 2.10:1 on charcoal.
    // Neither may be used on the wrong surface, which is why there are three values.
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_PAPER)).toBeLessThan(3);
    expect(contrast(VOUR_ORANGE_DEEP, VOUR_CHARCOAL)).toBeLessThan(3);
    expect(contrast(VOUR_ORANGE_DEEP, VOUR_PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_BLACK)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps text on every solid accent block readable", () => {
    // A filled badge is only an upgrade if the numeral inside it survives.
    expect(contrast(VOUR_WHITE, VOUR_ORANGE_DEEP)).toBeGreaterThanOrEqual(4.5); // light chip
    expect(contrast(VOUR_BLACK, VOUR_ORANGE_BRIGHT)).toBeGreaterThanOrEqual(4.5); // dark chip
    // White on either bright value is the mistake this guards against — and it is the
    // mistake the legacy deck actually shipped: white numerals on #EE4B1A, 3.71:1. The
    // badge is 18-22px, so 3:1 is not the bar it gets to use.
    expect(contrast(VOUR_WHITE, VOUR_ORANGE)).toBeLessThan(4.5);
    expect(contrast(VOUR_WHITE, VOUR_ORANGE_BRIGHT)).toBeLessThan(4.5);
    const badge = CSS.match(/\n\s*\.badge\s*\{[^}]*\}/)![0];
    expect(badge).toContain(VOUR_ORANGE_DEEP);
    // …but display-size knockout on the brand value is fine, and .node.filled uses it.
    expect(contrast(VOUR_WHITE, VOUR_ORANGE)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the second light surface from weakening any contrast", () => {
    // The second sheet is deliberately DARKER than the base, so it is the binding surface
    // and everything measured against it clears on the base too.
    expect(luminance(VOUR_PAPER)).toBeLessThanOrEqual(luminance(VOUR_MIST));
    expect(contrast(VOUR_BLACK, VOUR_PAPER)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_SLATE, VOUR_PAPER)).toBeGreaterThanOrEqual(7);
    expect(contrast(VOUR_ORANGE_DEEP, VOUR_PAPER)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("background variety is preserved", () => {
  it("still ships two distinct slide surfaces", () => {
    expect(CSS).toMatch(/body section:not\(\.paper\)\s*\{[\s\S]*?background:/);
    expect(carouselCss).toMatch(/section\s*\{[\s\S]*?background:/);
  });

  it("gives the dark surface depth rather than one flat black", () => {
    expect(CSS).toContain(`radial-gradient(130% 90% at 50% 0%, ${VOUR_CHARCOAL}, ${VOUR_BLACK} 68%)`);
  });

  it("holds every background wash inside the 10% ceiling the brief asked for", () => {
    // Only the background washes: an accent box-shadow on an accent chip is a different
    // thing and is allowed to be opaque. Orange carries more perceived weight per unit
    // of alpha than the teal it replaced, which is why these came DOWN rather than
    // across — see the note on the section background.
    const glows = [
      ...CSS.matchAll(/radial-gradient\([^)]*rgba\(\s*(?:255,\s*122,\s*69|238,\s*75,\s*26|168,\s*51,\s*8|15,\s*102,\s*102)\s*,\s*([\d.]+)\s*\)/g),
    ].map((m) => Number(m[1]));
    expect(glows.length).toBeGreaterThan(0);
    for (const a of glows) expect(a).toBeLessThanOrEqual(0.1);
  });

  it("textures the light surface instead of leaving it flat", () => {
    expect(carouselCss).toContain("32px 32px");
  });

  it("keeps all six card tones distinct", () => {
    const backgrounds = Object.values(VOUR_TONES).map((t) => t.bg);
    expect(new Set(backgrounds).size).toBe(6);
  });

  it("keeps the tone names honest about their own colour temperature", () => {
    // The teal palette had left "peach" holding an aqua and "amber" holding a cyan. The
    // names are the schema enum and cannot move, so the values have to be the ones that
    // match them.
    const isWarm = (hex: string) => {
      const c = hex.replace("#", "");
      const [r, , b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
      return r > b;
    };
    expect(isWarm(VOUR_TONES.peach.bg)).toBe(true);
    expect(isWarm(VOUR_TONES.amber.bg)).toBe(true);
    expect(isWarm(VOUR_TONES.sky.bg)).toBe(false);
  });
});

describe("emoji cannot smuggle colour onto a slide", () => {
  it("strips pictographic emoji from copy", () => {
    expect(stripEmoji("❌ Jangan index semua kolom")).toBe("Jangan index semua kolom");
    expect(stripEmoji("⚡ OVERLAP 💥 CORRUPT")).toBe("OVERLAP CORRUPT");
    expect(stripEmoji("selesai ✅")).toBe("selesai");
    expect(stripEmoji("👩‍💻 developer")).toBe("developer");
  });

  it("keeps the typographic marks the mockups rely on", () => {
    // These take their colour from CSS, so they are already themed.
    for (const mark of ["✓", "✗", "→", "─"]) {
      expect(stripEmoji(`a ${mark} b`)).toBe(`a ${mark} b`);
    }
  });

  it("leaves ordinary copy untouched, including Indonesian punctuation", () => {
    const s = "Planner milih jalur termurah — bukan niat kamu (100%).";
    expect(stripEmoji(s)).toBe(s);
  });

  it("removes them from rendered slide HTML, not just from the helper", () => {
    const html = renderSlide({
      role: "point",
      counter: "02 / 08",
      eyebrow: "TEST",
      headline: "Jangan ❌ begitu",
      accentWord: "begitu",
      body: "⚡ Planner milih jalur termurah.",
      mockup: { type: "callout", icon: "zap", text: "💥 Data korup" },
    });
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(html).toContain("Data korup");
  });
});

describe("accent never out-shouts the copy it serves", () => {
  // Measured against the surface each element actually sits on. The failure this
  // guards is not a contrast failure — every value here passes AA either way. It is a
  // HIERARCHY failure: an accent brighter than the body text moves the reader's entry
  // point off the sentence and onto the highlighted word.
  const BODY_ON_DARK = "#AEB2B2"; // --ms-fg-muted, 72% mist over black, resolved
  const HEADLINE_ON_DARK = VOUR_WHITE;

  it("keeps the dark-surface text accent dimmer than the body copy", () => {
    const accent = contrast(VOUR_ORANGE_BRIGHT, VOUR_BLACK);
    const body = contrast(BODY_ON_DARK, VOUR_BLACK);
    expect(accent).toBeLessThan(body);
    // and comfortably under the headline, which is the real primary
    expect(accent).toBeLessThan(contrast(HEADLINE_ON_DARK, VOUR_BLACK));
  });

  it("still clears AA for the accent word at body size", () => {
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_BLACK)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_CHARCOAL)).toBeGreaterThanOrEqual(4.5);
  });

  it("documents why the brand orange itself cannot be the text accent on dark", () => {
    // The failure runs the OTHER way from the teal one: #EE4B1A is not too bright, it is
    // too dim. At 5.66:1 against 9.81:1 body copy the accent word reads as a dimmed patch
    // inside its own headline. If someone restores it here, this is the number that says
    // why not.
    const brand = contrast(VOUR_ORANGE, VOUR_BLACK);
    const body = contrast(BODY_ON_DARK, VOUR_BLACK);
    expect(brand / body).toBeLessThan(0.7);
    expect(contrast(VOUR_ORANGE_BRIGHT, VOUR_BLACK) / body).toBeGreaterThan(0.75);
  });

  it("keeps the light-surface ordering headline > body > accent", () => {
    const headline = contrast(VOUR_BLACK, VOUR_MIST);
    const body = contrast("#223131", VOUR_MIST);
    const accent = contrast(VOUR_ORANGE_DEEP, VOUR_MIST);
    expect(headline).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(accent);
  });

  it("keeps a cover status glyph brighter than the node that frames it", () => {
    // The NOC grid failed the same way round as the accent word did, one level down:
    // the glyph measured 7.2:1 on the node fill (well past the 3:1 a graphic needs), but
    // the node's own border was heavier and the glyph was drawn at 34px inside a ~124px
    // tile, so the grid read as eighteen empty boxes. Assert the ordering, not just AA.
    const NODE_FILL = "#2A1812"; // rgba(114,99,88,0.16) over the Ink cover, resolved
    const NODE_BORDER = VOUR_NEGATIVE;
    const DOWN_GLYPH = "#BEB4AC"; // VOUR_MIST_MUTED (0.72) over NODE_FILL, resolved

    expect(contrast(DOWN_GLYPH, NODE_FILL)).toBeGreaterThanOrEqual(3);
    expect(contrast(VOUR_POSITIVE_ON_DARK, NODE_FILL)).toBeGreaterThanOrEqual(3);
    // The glyph must out-rank its own frame, or the chrome reads as the content.
    expect(contrast(DOWN_GLYPH, NODE_FILL)).toBeGreaterThan(contrast(NODE_BORDER, NODE_FILL));
    // …and stay under the cover headline, which is still the primary.
    expect(contrast(DOWN_GLYPH, VOUR_BLACK)).toBeLessThan(contrast(VOUR_WHITE, VOUR_BLACK));
  });

  it("documents why the old 'up' state colour could not stay", () => {
    // The light-surface positive on the node fill is technically a pass and visibly a
    // smudge — dimmer than the border around it, which is why the dark pair exists.
    const NODE_FILL = "#2A1812";
    expect(contrast(VOUR_POSITIVE, NODE_FILL)).toBeLessThan(
      contrast(VOUR_POSITIVE_ON_DARK, NODE_FILL)
    );
  });

  it("keeps all three ember values actually in use", () => {
    // Three tokens is only justified if three tokens are doing work. If one stops
    // appearing, the split has collapsed and the file should say so.
    for (const v of [VOUR_ORANGE, VOUR_ORANGE_DEEP, VOUR_ORANGE_BRIGHT]) expect(CSS).toContain(v);
  });
});

describe("small labels are one consistent stamp system", () => {
  // The eyebrow, the slide counter, the CATATAN tab, the card label and every mockup
  // caption are the same kind of object: a small uppercase mono stamp. They had drifted —
  // the counter was grey furniture while the eyebrow beside it carried the accent.
  const STAMP_SELECTORS = [".eyebrow", ".counter", ".catatan-label", ".card-label"];

  it("sets every stamp in JetBrains Mono", () => {
    for (const sel of STAMP_SELECTORS) {
      const block = CSS.match(new RegExp(`\\n\\s*\\${sel}\\s*\\{[^}]*\\}`));
      expect(block, sel).not.toBeNull();
      expect(block![0], sel).toContain("JetBrains Mono");
    }
  });

  it("gives every stamp the accent rather than a neutral", () => {
    for (const sel of STAMP_SELECTORS) {
      const block = CSS.match(new RegExp(`\\n\\s*\\${sel}\\s*\\{[^}]*\\}`))![0];
      expect(block.toLowerCase(), sel).toContain(VOUR_ORANGE_DEEP.toLowerCase());
    }
  });

  it("colours the swipe CTA's text and arrow, not just the rule beside them", () => {
    // The reported bug: the rule was the only part with a colour of its own. The rule now
    // inherits currentColor, so the three cannot drift apart again.
    const geser = CSS.match(/\n\s*\.geser\s*\{[^}]*\}/g) ?? [];
    expect(geser.length).toBeGreaterThan(0);
    expect(geser.join("").toLowerCase()).toContain(VOUR_ORANGE_DEEP.toLowerCase());
    const rule = CSS.match(/\.geser::before\s*\{[^}]*\}/)![0];
    expect(rule).toContain("currentColor");
  });
});
