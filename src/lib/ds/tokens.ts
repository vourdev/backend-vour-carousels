/**
 * Vour brand palette — "Engineering Editorial", ember on cream.
 *
 * The LOGO is teal. The CONTENT is ember orange on warm paper. That split is deliberate:
 * the mark keeps its own colour, and the deck it introduces is set in the editorial
 * palette this design system was originally built in. Teal has NO role in slide content —
 * not as a primary, not as a secondary. A single accent plus six pastel card tones is
 * what carries variety here; a second accent hue would compete with the tones rather
 * than add to them.
 *
 * The whole sheet is warm. Surfaces, body copy, hairlines and the "dead" semantic are all
 * on the ember axis, desaturated — which is what stops the accent from looking like an
 * orange sticker on a grey page. Nothing in the deck sits on the cool half of the wheel
 * except the three tonal cards that are supposed to (mint, sky, pink).
 *
 * Contrast ratios below are measured (WCAG 2.1 relative luminance), not estimated, and
 * every one is taken against VOUR_PAPER — the DARKER of the two light surfaces — so a
 * value that clears here clears on both.
 */

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

/**
 * Ink. Headline copy on light surfaces, and the floor of the dark-surface gradient.
 *
 * Not #000000: a warm near-black under a warm accent is the difference between a page
 * and a printout. 17.8:1 on the base cream, 17.1:1 on the second one.
 */
export const VOUR_BLACK = "#1C0A05";

/**
 * Dark surface one step above Ink — the panel/alternate dark, and the top of the
 * gradient that gives a dark slide depth instead of a flat void. 3.9x Ink's luminance,
 * which is a step the eye actually reads at slide scale.
 */
export const VOUR_CHARCOAL = "#2B241D";

/** Panel on dark surfaces, one step above charcoal. */
export const VOUR_INK_PANEL = "#382E25";

/** White. Knockout text on solid accent blocks, and the raised-card fill. */
export const VOUR_WHITE = "#FFFFFF";

/**
 * Base light surface — warm cream. This is the deck's default sheet.
 *
 * The token is named MIST for history: it used to hold a cool off-white, and renaming it
 * would touch every template. Read it as "paper, base".
 */
export const VOUR_MIST = "#FBF6EF";

/**
 * Second light surface — the same cream pulled a step deeper, so two paper slides in a
 * row never look like one long page. It is the DARKER of the pair and therefore the
 * binding surface for every contrast check in this file:
 *
 *   ink 17.06:1  ·  body #3D2419 12.75:1  ·  secondary #6E4B3E 6.82:1
 *   accent (small) 5.17:1  ·  accent (display) 3.30:1
 *
 * Which paper a slide gets is decided by the renderer, not the model. See the comment on
 * the .paper.warm rule in carousel-css-extra.ts.
 */
export const VOUR_PAPER = "#F7F1E6";

/* ── Ember: the accent ────────────────────────────────────────────────────────
 * Three values, one per JOB, and the split is forced by measurement rather than by
 * taste. Orange sits low on the luminance curve, so the value that looks like the brand
 * cannot also be the value that passes AA at 24px:
 *
 *                cream   cream-2   ink    charcoal
 *   #EE4B1A       3.45     3.30    5.07     4.65
 *   #B8380E       5.41     5.17    2.30     2.10
 *   #FF7A45       2.40     2.30    7.24     6.67
 *
 * 3.45:1 clears the 3:1 that DISPLAY text (>=24px, or >=19px bold) and graphics need, and
 * misses the 4.5:1 that a 24px mono label needs. So the brand value carries the big
 * things and a deeper sibling carries the small ones. The two are close enough in hue
 * that a slide reads as one colour; they are far enough apart in lightness that the
 * label is legible.
 */

/**
 * THE brand ember. DISPLAY and GRAPHICS only: the headline accent word, the oversized
 * cover numeral, filled nodes, bars, rules, arrows, diagram strokes, icon tiles, the dot
 * grid and the corner washes. Never a label under 24px — that is VOUR_ORANGE_DEEP.
 *
 * As a solid fill it takes WHITE knockout at display size (3.71:1, past the 3:1 large
 * text needs) and INK knockout anywhere smaller (5.17:1).
 */
export const VOUR_ORANGE = "#EE4B1A";

/**
 * Ember for SMALL text and small solid chips on light surfaces: eyebrow, counter, series
 * stamp, CATATAN label, card label, panel headers, badges.
 *
 * 5.17:1 on the binding cream, and >=4.55:1 on all six tonal card backgrounds (pink is
 * the tightest), so accent copy is safe anywhere on the light half of the deck. White on
 * it is 5.82:1, which is what lets a numbered badge keep white numerals.
 *
 * Candidates measured on the binding cream before choosing: #EE4B1A 3.30 (fails),
 * #D8420F 3.83 (fails), #CC3D0E 4.25 (fails), #C43A0C 4.56 (passes, but 4.34 on the amber
 * card), #B8380E 5.17 (chosen).
 */
export const VOUR_ORANGE_DEEP = "#B8380E";

/**
 * Ember on DARK surfaces — text and solid fills alike.
 *
 * 7.24:1 on Ink. Chosen for the ORDERING as much as the floor: body copy on the dark
 * canvas is 8.93:1, so this lands at 0.81x — the accent reads as a highlight inside the
 * sentence rather than as a rival to it. The brand value itself is 0.57x there, which is
 * the opposite failure: an accent word visibly dimmer than the sentence it sits in.
 *
 * A solid block of it takes INK glyphs (7.42:1), never white (2.32:1).
 */
export const VOUR_ORANGE_BRIGHT = "#FF7A45";

/**
 * Pale ember panel tint — the wash under highlights, pull-quotes and the peach step
 * cards. Identical to the `peach` card tone by design: the wash and the default card are
 * the same paper, not two nearly-equal creams. Ink is 16.2:1 on it and the small accent
 * 4.92:1, so it carries copy as well as decoration.
 */
export const VOUR_ORANGE_WASH = "#FBE9D9";

/* ── Derived neutrals ─────────────────────────────────────────────────────────
 * Every step is the ember hue desaturated, so the greys read as part of the palette
 * rather than as generic UI grey. This is the half of the revert that does the most
 * work: an ember accent over cool greys looks like a colour that was swapped in, and
 * over warm ones it looks like a page that was designed. */

/** Body copy on light surfaces — 12.75:1 on the binding cream. */
export const VOUR_SLATE = "#3D2419";
/** Secondary text on light surfaces — 6.82:1. */
export const VOUR_SLATE_SOFT = "#6E4B3E";
/**
 * Faint text / captions on light surfaces — 5.02:1, and 4.77:1 on the peach card.
 *
 * NOT the legacy #A48C7E it replaces. That value measures 2.82:1 on this surface and was
 * carrying mock captions, table sub-labels and the slide counter, all of which are small
 * text needing 4.5:1. Same hue, taken down until it passes.
 */
export const VOUR_SLATE_FAINT = "#7E6153";
/** Hairlines and borders on light surfaces. */
export const VOUR_LINE_LIGHT = "rgba(28, 10, 5, 0.14)";

/** Body copy on dark surfaces — 8.93:1 on Ink. */
export const VOUR_MIST_MUTED = "rgba(247, 241, 232, 0.72)";
/** Faint text on dark surfaces — 4.87:1. Raised from the 0.45 the cooler, darker Ink
 *  could carry; on this warmer floor that alpha lands at 4.14:1. */
export const VOUR_MIST_FAINT = "rgba(247, 241, 232, 0.52)";
/** Hairlines and borders on dark surfaces. */
export const VOUR_LINE_DARK = "rgba(247, 241, 232, 0.16)";

/* ── Tonal family ─────────────────────────────────────────────────────────────
 * Six pastel card/step tones, and with no second accent in the system they are what
 * keeps a deck from reading as one colour. Three warm, three cool.
 *
 * The CLASS NAMES are the schema's tone enum and cannot change — renaming one would
 * invalidate every plan already stored in the carousels table. The values are the ones
 * the names describe, which has not always been true of this file.
 *
 * Every ink below is >= 4.5:1 on its own background, and VOUR_ORANGE_DEEP clears 4.5:1
 * on all six, so accent copy is safe on any card. */
export const VOUR_TONES = {
  /** neutral / default — the same value as VOUR_ORANGE_WASH */
  peach: { bg: "#FBE9D9", ink: "#B8380E" },
  /** loser / scraped — deliberately the least saturated, so it reads as the dead one */
  stone: { bg: "#EDE7DA", ink: "#726358" },
  /** success */
  mint: { bg: "#E3F1E1", ink: "#356B34" },
  /** tooling / info */
  sky: { bg: "#DEEAF7", ink: "#245F8F" },
  /** design */
  pink: { bg: "#F7DDE6", ink: "#5C5CA8" },
  /** highlight / performance */
  amber: { bg: "#FBE7B0", ink: "#8A5A08" },
} as const;

export type VourTone = keyof typeof VOUR_TONES;

/* ── Semantic pairs ───────────────────────────────────────────────────────────
 * The deck marks wrong-vs-right in several places (comparison panels, ✗/✓ rows, NOC
 * up/down). "Wrong" is carried by DESATURATION, not by hue: the failing side goes flat
 * warm grey while the passing side keeps saturation. The glyph (✗ / ✓) does the primary
 * work, as it always did.
 *
 * Ember is deliberately NOT the negative colour, even though red-orange is the obvious
 * reach. Ember is the emphasis accent on every slide in the deck; if it also meant "this
 * one is wrong", every headline accent word would read as a warning. */
export const VOUR_NEGATIVE = "#726358";
export const VOUR_POSITIVE = "#356B34";
/** Brighter pair for dark surfaces. */
export const VOUR_NEGATIVE_ON_DARK = "#B0A49A";
export const VOUR_POSITIVE_ON_DARK = "#86C97F";

/* ── Terminal syntax ──────────────────────────────────────────────────────────
 * A code block needs several distinguishable colours, and they are the one place the
 * deck is allowed more than one hue — a terminal is a quotation from another system.
 * They are still warm-compatible rather than the stock cool syntax palette, and all sit
 * above 8:1 on the Ink body they are printed on. */
export const VOUR_CODE = {
  key: "#FBBF77",
  val: "#B79CF2",
  str: "#C1DE9E",
  num: "#E8B4A0",
  kw: "#FF8A4C",
  cmt: "rgba(247, 241, 232, 0.42)",
} as const;
