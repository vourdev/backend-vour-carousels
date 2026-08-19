/**
 * Remove colour emoji from slide copy.
 *
 * Emoji are the one thing on a slide the palette cannot reach. A font renders ❌ red,
 * ⚡ yellow and 💥 orange from its own embedded bitmaps; no CSS colour, no surface
 * token and no SVG remap touches them. So a model that writes "❌ Jangan index semua
 * kolom" puts warm colour on a deck that has none anywhere else, and it does it
 * invisibly — the palette guard reads the CSS, not the rendered glyph.
 *
 * The prompt also asks the model not to use them. This is the part that does not
 * depend on the model complying.
 *
 * Deliberately narrow: only pictographic emoji go. Typographic marks that inherit
 * `color` are kept, because several mockups rely on them — the datatable's ✗/✓, the
 * flow arrow →, the database relation glyph ─<∞. Those are text, and text is themed.
 */

/**
 * Pictographic ranges plus the modifiers that attach to them. Presentation selectors
 * and ZWJ are included so a sequence like 👩‍💻 does not leave orphans behind.
 */
const EMOJI = new RegExp(
  "[" +
    "\\u{1F000}-\\u{1FAFF}" + // symbols, pictographs, emoticons, transport, supplemental
    "\\u{1F1E6}-\\u{1F1FF}" + // regional indicators (flags)
    "\\u{2600}-\\u{27BF}" + // misc symbols + dingbats  (☀ ⚡ ✅ ❌ ➡ …)
    "\\u{2B00}-\\u{2BFF}" + // arrows/shapes block that carries ⬛ ⭐ …
    "\\u{FE0F}\\u{FE0E}" + // variation selectors (emoji / text presentation)
    "\\u{1F3FB}-\\u{1F3FF}" + // skin-tone modifiers
    "\\u{200D}" + // zero-width joiner
    "]",
  "gu"
);

/**
 * Marks inside the stripped ranges that the design system uses as TEXT and that
 * inherit `color`, so they must survive. ✗/✓ carry the meaning of a datatable row;
 * arrows carry flow direction.
 */
const KEEP = new Set(["✓", "✔", "✗", "✘", "→", "←", "↑", "↓", "─", "≺", "★", "☆"]);

/** Strip pictographic emoji, then tidy the whitespace they leave behind. */
export function stripEmoji(s: string): string {
  if (!s) return s;
  const out = s.replace(EMOJI, (ch) => (KEEP.has(ch) ? ch : ""));
  if (out === s) return s;
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}
