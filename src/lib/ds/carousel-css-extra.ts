// Additive carousel styles that must NOT live in the verbatim DS-bundle block
// (lib/ds/carousel-css.ts mirrors the design-system template). Appended after it in assemble.
import {
  VOUR_BLACK,
  VOUR_CHARCOAL,
  VOUR_PAPER,
  VOUR_LINE_DARK,
  VOUR_LINE_LIGHT,
  VOUR_MIST,
  VOUR_MIST_FAINT,
  VOUR_MIST_MUTED,
  VOUR_NEGATIVE_ON_DARK,
  VOUR_ORANGE,
  VOUR_ORANGE_BRIGHT,
  VOUR_ORANGE_DEEP,
  VOUR_ORANGE_WASH,
  VOUR_POSITIVE_ON_DARK,
  VOUR_SLATE,
  VOUR_SLATE_FAINT,
  VOUR_WHITE,
} from "../ds/tokens";

export const carouselExtraCss = String.raw`
  /* ═══ Surface tokens ═══
     A mockup must never name a literal ink/paper colour. Descendant CSS can be
     re-scoped per surface, but an inline style="color:#1C0A05" or an SVG
     fill="#1C0A05" cannot — which is why bigstat's unit and gitbranch's main
     line rendered near-black on the near-black Ink canvas. Templates resolve
     these tokens instead, so one declaration below flips the whole component.

     Interpolated from lib/ds/tokens.ts rather than written as literals: this block
     is the seam where the brand palette enters the deck, so it is the one place that
     must not be able to drift from the token file.

     Defaults are the light-surface values, matching the base palette; the dark block
     re-binds them. Anything reading a token is correct on BOTH surfaces with no
     per-surface rule of its own. */
  section {
    --ms-fg: ${VOUR_BLACK};
    --ms-fg-muted: ${VOUR_SLATE};
    --ms-fg-faint: ${VOUR_SLATE_FAINT};
    --ms-panel: ${VOUR_WHITE};
    --ms-panel-deep: ${VOUR_MIST};
    --ms-line: ${VOUR_LINE_LIGHT};
    --ms-accent: ${VOUR_ORANGE_DEEP};
    /* Text/glyph that sits ON a solid --ms-accent block. White on ember deep is 5.82:1. */
    --ms-accent-on: ${VOUR_WHITE};
    /* The brand ember, for DISPLAY and GRAPHICS only — rules, fills, strokes, the
       headline accent word. --ms-accent above is the deeper sibling that small labels
       and small solid chips use. Two tokens because 24px mono needs 4.5:1 and the brand
       value is 3.30:1 here; see the note on VOUR_ORANGE. */
    --ms-accent-display: ${VOUR_ORANGE};
    /* Callout inverts against its surface — that inversion IS the emphasis. */
    --ms-invert-bg: ${VOUR_BLACK};
    --ms-invert-fg: ${VOUR_WHITE};
    --ms-invert-chip: rgba(247, 241, 232, 0.10);
    /* Accent for a chip sitting on --ms-invert-bg, and the knockout colour inside it.
       On an Ink callout that is the dark-surface ember with an Ink glyph (7.4:1). */
    --ms-invert-accent: ${VOUR_ORANGE_BRIGHT};
  }
  body section:not(.paper) {
    --ms-fg: ${VOUR_WHITE};
    --ms-fg-muted: ${VOUR_MIST_MUTED};
    --ms-fg-faint: ${VOUR_MIST_FAINT};
    --ms-panel: ${VOUR_CHARCOAL};
    --ms-panel-deep: ${VOUR_BLACK};
    --ms-line: ${VOUR_LINE_DARK};
    /* Ember bright, not the brand ember: #EE4B1A is 5.07:1 on Ink but only 0.57x the
       body copy, so it reads as a dimmed patch. See the note on VOUR_ORANGE_BRIGHT.
       On dark, one value serves display and small text alike, so --ms-accent-display
       resolves to the same hex. A solid block of it takes INK glyphs (7.4:1), never
       white (2.32:1). */
    --ms-accent: ${VOUR_ORANGE_BRIGHT};
    --ms-accent-on: ${VOUR_BLACK};
    --ms-accent-display: ${VOUR_ORANGE_BRIGHT};
    --ms-invert-bg: ${VOUR_MIST};
    --ms-invert-fg: ${VOUR_BLACK};
    --ms-invert-chip: rgba(28, 10, 5, 0.08);
    --ms-invert-accent: ${VOUR_ORANGE_DEEP};
  }

  /* ═══ Second light surface ═══
     The dark half of the deck has two surfaces (Ink and charcoal). The light half had
     one, so every paper slide in a deck looked identical. This is the same cream pulled
     a step deeper — same dot grid, same ember washes, and the corners SWAPPED so the
     light falls from the other side. Two sheets of the same stock, not two themes.

     WHICH paper a slide gets is decided by the renderer from the slide index, not by the
     model. Same rule as the illustration variant: the model picks content, the renderer
     owns rhythm. Handing this to the model would be handing it a colour choice, which is
     the one thing the palette guard exists to prevent. */
  body section.paper.warm {
    background:
      radial-gradient(circle at 1px 1px, rgba(238,75,26,0.05) 1.5px, transparent 1.6px) 0 0 / 32px 32px,
      radial-gradient(55% 40% at 100% 0%, rgba(238,75,26,0.05), transparent 65%),
      radial-gradient(60% 50% at 10% 100%, rgba(238,75,26,0.08), transparent 70%),
      ${VOUR_PAPER};
  }

  /* ═══ Filled accents ═══
     A deck whose only colour is thin accent text and 1.5px accent rules reads as
     newsprint. These rules move the recurring small components from outline to SOLID
     BLOCK, which is what separates a magazine page from a broadsheet. Everything below
     fills with an ember value or a tonal card value — no component invents a hue.

     .card and .step are pale panels on BOTH surfaces (their tone backgrounds are literal
     light colours, not tokens), so chips inside them are pinned to the light-surface
     accent rather than to --ms-accent. On a dark slide the token would resolve to
     #FF7A45 and that chip on a #FBE9D9 card is 1.30:1 — invisible. */
  /* Alternating step panel. Not a seventh entry in the tone enum the model can pick
     from — the renderer applies it, on alternating step cards, so the stack reads as a
     rhythm. It is the amber tone value, reused rather than reinvented. */
  .card-alt { background: #FBE7B0; }

  .card-ico { background: ${VOUR_ORANGE}; }
  .card-ico svg { stroke: ${VOUR_WHITE}; }

  /* The callout DOES invert with the surface, so its chip follows the tokens: a bright
     orange chip on the black callout, a deep orange chip on the Mist one, with the glyph
     knocked out in the callout's own background colour. */
  .callout-ico { background: var(--ms-invert-accent); }
  .callout-ico svg { stroke: var(--ms-invert-bg); }

  /* Numbered badges stay one colour. With no second accent, the alternation down a step
     stack is carried by the PANEL (peach / amber) instead — a badge that changed hue per
     row would read as a status, not as a rhythm. White numerals on the deeper ember are
     5.82:1; on the brand value they would be 3.71:1, under AA at 18px. */

  /* Eyebrow as a filled chip. Used on alternating slides rather than everywhere: the
     point is variation between slides, and a chip on every slide is just a new default.

     The dark-surface rules below carry ":not(.chip)" for a reason: "body section:not
     (.paper) .eyebrow" is 0-2-1 and beats this 0-2-0 rule, so the chip's knockout colour
     lost and the label was painted in the same value as the pill behind it — zero
     contrast, caught in a render diff rather than by any rule. */
  .eyebrow.chip {
    display: inline-block; align-self: flex-start;
    background: var(--ms-accent); color: var(--ms-accent-on);
    padding: 12px 22px 10px; border-radius: 999px;
    font-size: 22px; letter-spacing: 0.16em;
  }

  /* CATATAN recap: the label becomes a solid tab instead of coloured text on nothing. */
  .catatan-label.chip {
    display: inline-block;
    background: var(--ms-accent); color: var(--ms-accent-on);
    padding: 8px 16px 6px; border-radius: 8px; font-size: 20px;
  }

  /* Text-only editorial cover: brand-row pinned top, "Geser" pinned bottom,
     lead block optically centered on the 1080×1350 canvas. */
  .cover-editorial .cover-lead {
    margin-top: auto;
    margin-bottom: auto;
    display: flex;
    flex-direction: column;
  }
  .cover-editorial .lede { max-width: 860px; }

  /* Series stamp — one per deck, top-right on the cover. "Deep Dive" · "AI For Devs".
     Sits on the same row as the brand handle and does the same job as the eyebrow does
     one row down: name the section. It used to be EB Garamond italic in a muted brown,
     which made it the only serif on the page AND the only accent-position element
     without the accent — an italic caption floating next to the logo rather than a
     masthead. It is now Sora — the deck's display face — set small, uppercase and
     tracked out, in the accent. It sits on the brand row opposite a 32px Sora handle, so
     matching that face is what makes the row read as one masthead; the mono treatment
     the eyebrow uses belongs one row down, where the counter is. */
  .series-stamp {
    font-family: 'Sora', system-ui, sans-serif;
    font-weight: 700; font-size: 24px; line-height: 1;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: ${VOUR_ORANGE_DEEP};
  }
  .series-stamp.active { color: ${VOUR_ORANGE_DEEP}; }

  /* Improvised editorial-Ink intro container & ghost spacing */
  /* No height here: "section" already pins 1350px, and a "height:100%" on this
     class outranks it and resolves against a body with no height, collapsing the
     cover to its content. */
  .cover-editorial-ink {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .ce-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }
  .ce-lead {
    margin-top: auto;
    margin-bottom: auto;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }
  .ce-ghost {
    position: absolute;
    right: -80px;
    bottom: 200px;
    font-family: 'Sora', sans-serif;
    font-weight: 800;
    font-size: 640px;
    line-height: 0.85;
    color: #FF7A45;
    opacity: 0.06;
    pointer-events: none;
    user-select: none;
    z-index: 1;
  }

  /* ═══ Deck-wide Dark Ink default (matches cover-slides.html) ═══
     Ink is the DEFAULT surface for every slide. carousel-css.ts is DO-NOT-EDIT and
     paints Paper via bare selectors (specificity 0-0-1 / 0-1-0). This file is
     appended AFTER it in assemble.ts, so scoping under "body section" wins on
     specificity + source order WITHOUT !important.

     EVERY ink rule below is scoped ":not(.paper)". That is load-bearing, not
     cosmetic: a bare "body section .node" also matches a section.paper, so a
     cream slide was being handed dark-surface mockups (hub/concept/flow nodes,
     datatable rules, steps, terminal, quote, browser, …) and the mockup no
     longer matched the slide it sat on. Paper is now simply the ABSENCE of these
     rules — it falls through to the DO-NOT-EDIT base, so there is no second copy
     of the cream palette to keep in sync. When adding an ink rule here, scope it
     the same way; do not add a paper counterpart. */
  /* Dark surface. The base is a charcoal-to-black fall rather than one flat black:
     logo black is the floor, VOUR_CHARCOAL is the step above it, and the gradient
     between them is what stops a dark slide reading as an unstyled void. */
  body section:not(.paper) {
    position: relative;
    background:
      linear-gradient(rgba(247,241,232,0.03), transparent 220px),
      radial-gradient(130% 90% at 50% 0%, #2B241D, #1C0A05 68%);
    color: #FFFFFF;
  }
  /* Two ember glows, held at 4-5%. That is lower than the cool palette used, and it has
     to be: the dark surface is itself warm now, so a glow of the same hue no longer
     contrasts with the canvas — it just raises the brown. Past ~5% the corner stops
     reading as light in the room and starts reading as a stain. Corner placement is what
     gives consecutive dark slides different centres of gravity. */
  body section:not(.paper)::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(60% 42% at 100% 0%, rgba(255,122,69,0.05), transparent 60%),
      radial-gradient(50% 40% at 0% 100%, rgba(238,75,26,0.04), transparent 65%);
  }
  body section > * { position: relative; z-index: 1; }

  /* Text + default elements coloring on the dark canvas.

     One dark-surface accent serves both text and chrome here — the light half needs two
     values, this one does not. Orange bright is 8.12:1 on black against body copy's
     9.81:1 — 0.83x, so the accent word sits inside the sentence instead of out-shouting
     it, and the same value is bright enough for a border or a node fill. */
  body section:not(.paper) .eyebrow:not(.chip) { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .counter { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) h1 { color: #FFFFFF; }
  body section:not(.paper) h1 .a { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .lede,
  body section:not(.paper) .body-text { color: rgba(247,241,232,0.72); }
  body section:not(.paper) .geser { color: ${VOUR_ORANGE_BRIGHT}; }

  /* ═══ Accent chrome on the dark canvas ═══
     carousel-css.ts paints these in the LIGHT accent (#B8380E), which is 2.79:1 against
     charcoal — a rule or an arrow in it is barely there. Every element below is the
     primary accent doing structural work, so on Ink it re-binds to the dark value. The
     one that is not a straight swap is .node.filled: a solid #FF7A45 block takes BLACK
     glyphs (8.12:1), never the white the light-surface fill uses (2.42:1). */
  body section:not(.paper) .series-stamp,
  body section:not(.paper) .series-stamp.active { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .catatan { border-color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .catatan-label:not(.chip) { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .diag-flow .arrow,
  body section:not(.paper) .scene-arrow { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .diag-hub svg.lines .stroke,
  body section:not(.paper) .diag-icon-hub svg.lines .stroke { stroke: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .diag-hub svg.lines .head,
  body section:not(.paper) .diag-icon-hub svg.lines .head { fill: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .diag-tokens .chip { border-color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .diag-bars .panel .h { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .diag-bars .bar { background: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .node.filled {
    background: ${VOUR_ORANGE_BRIGHT};
    border-color: ${VOUR_ORANGE_BRIGHT};
    color: ${VOUR_BLACK};
  }
  /* Accent TEXT inside a panel that is itself dark on Ink. These three read against the
     panel, not the canvas, and the panel is charcoal — the light accent measures 2.8:1
     there, which is the "is that even coloured?" band. */
  body section:not(.paper) .clist .cmd,
  body section:not(.paper) .tree .on,
  body section:not(.paper) .db .rel { color: ${VOUR_ORANGE_BRIGHT}; }

  /* Semantic pair on the dark canvas. The light-surface values are a deep green and a
     mid warm grey; on Ink they measure ~2.6:1 and ~2.2:1, so a checklist tick and a
     table's ✓/✗ column read as smudges. The brighter pair exists for exactly this. */
  body section:not(.paper) .checklist .tick,
  body section:not(.paper) .dt-hr .ok,
  body section:not(.paper) .perm-cell .yes { color: ${VOUR_POSITIVE_ON_DARK}; }
  body section:not(.paper) .dt-hr .no,
  body section:not(.paper) .perm-cell .no { color: ${VOUR_NEGATIVE_ON_DARK}; }

  /* Info cards keep their LIGHT tone background + dark text on ink (they read as
     raised light tiles) — only soften the edge against the dark canvas. */
  body section:not(.paper) .card { box-shadow: 0 24px 60px rgba(28,10,5,0.35); }
  body section:not(.paper) .catatan-body { color: #FFFFFF; }
  body section:not(.paper) .checklist li { color: #FFFFFF; }
  body section:not(.paper) .brand-handle { color: #FFFFFF; }

  /* Panels that are dark BY DESIGN (terminal, command palette) sit only 11 points
     of luminance above the Ink canvas, so on Ink they read as a smudge rather
     than a device. A hairline edge is what separates them from the background. */
  body section:not(.paper) .cmdp {
    border-color: rgba(247,241,232, 0.16);
    box-shadow: 0 24px 60px rgba(28, 10, 5, 0.45);
  }
  body section:not(.paper) .cmdp .search { border-bottom-color: rgba(247,241,232, 0.14); }

  /* Git branch SVG — bound to the surface tokens. CSS beats SVG presentation
     attributes, so these win wherever the template still carries a literal. */
  .git .g-main { stroke: var(--ms-fg); }
  .git .g-dot { fill: var(--ms-fg); }
  .git .g-label { fill: var(--ms-fg-muted); }
  .git .g-feat { stroke: var(--ms-accent); }
  .git .g-fdot { fill: var(--ms-accent); }
  .git .g-flabel { fill: var(--ms-accent); }

  /* ═══ Mockup fit — surface-independent, applies on Paper and Ink alike ═══ */

  /* Flow chain: the row could not wrap and .node forbids wrapping its own text,
     so a 4-5 step flow (labels up to 24 chars) overflowed the 920px content box.
     justify-content:center then split the overflow, clipping the first and last
     node against section{overflow:hidden}. Wrapping keeps every step on canvas. */
  .diag-flow { flex-wrap: wrap; row-gap: 16px; max-width: 100%; }
  .diag-flow .flow-step { display: inline-flex; align-items: center; gap: 20px; max-width: 100%; }
  .diag-flow .node {
    max-width: 100%;
    white-space: normal;
    text-align: center;
    font-size: 24px;
    padding: 14px 20px;
  }

  /* Recap checklist: 40px Sora blew past the canvas once a deck used 5-6 items,
     and a single 48-char item was wider than the content box on its own. */
  .checklist { width: 100%; }
  .checklist li {
    align-items: flex-start;
    font-size: 32px;
    line-height: 1.3;
  }
  .checklist .tick { font-size: 32px; line-height: 1.3; width: 36px; }

  /* ═══ Mockup border/chrome overrides — INK SURFACE ONLY ═══ */
  body section:not(.paper) .browser {
    border-color: rgba(247,241,232, 0.16);
    box-shadow: 0 24px 60px rgba(28, 10, 5, 0.4);
  }
  body section:not(.paper) .b-chrome {
    background: #2B241D;
    border-bottom-color: rgba(247,241,232, 0.14);
  }
  body section:not(.paper) .b-url {
    background: #1C0A05;
    border-color: rgba(247,241,232, 0.16);
    color: rgba(247,241,232, 0.72);
  }
  body section:not(.paper) .b-card {
    background: #2B241D;
    border-color: rgba(247,241,232, 0.14);
  }
  body section:not(.paper) .b-card .t {
    color: #FFFFFF;
  }
  body section:not(.paper) .b-card .s {
    color: rgba(247,241,232, 0.45);
  }

  body section:not(.paper) .terminal {
    border: 1.5px solid rgba(247,241,232, 0.16);
    background: #2B241D;
    box-shadow: 0 24px 60px rgba(28, 10, 5, 0.4);
  }
  body section:not(.paper) .terminal-bar {
    border-bottom: 1px solid rgba(247,241,232, 0.10);
    padding-bottom: 12px;
  }

  body section:not(.paper) .prompt {
    background: #2B241D;
    border-color: #FF7A45;
  }
  body section:not(.paper) .prompt .lbl {
    background: #1C0A05;
    color: #FF7A45;
  }
  body section:not(.paper) .prompt pre {
    color: #FFFFFF;
  }

  body section:not(.paper) .tree {
    background: #2B241D;
    border-color: rgba(247,241,232, 0.16);
    color: rgba(247,241,232, 0.72);
  }

  body section:not(.paper) .db .table {
    border-color: rgba(247,241,232, 0.16);
    background: #2B241D;
  }
  body section:not(.paper) .db .table .th {
    background: #1C0A05;
    color: #FFFFFF;
  }
  body section:not(.paper) .db .table .tr {
    color: rgba(247,241,232, 0.72);
    border-top-color: rgba(247,241,232, 0.10);
  }
  body section:not(.paper) .db .table .tr .ty {
    color: rgba(247,241,232, 0.45);
  }

  body section:not(.paper) .node {
    background: #2B241D;
    border-color: rgba(247,241,232, 0.16);
    color: #FFFFFF;
  }
  /* .node.filled on Ink is set in the accent-chrome block above — the dark value with
     black glyphs. Do not re-declare it here; a second rule of equal specificity later in
     the sheet is what would silently win. */

  body section:not(.paper) .step {
    background: #2B241D;
    border: 1.5px solid rgba(247,241,232, 0.14);
  }
  body section:not(.paper) .step-title {
    color: #FFFFFF;
  }
  body section:not(.paper) .step-body {
    color: rgba(247,241,232, 0.72);
  }

  body section:not(.paper) .timeline .tl-card.old {
    background: #2B241D;
    border: 1.5px solid rgba(247,241,232, 0.10);
  }
  body section:not(.paper) .timeline .tl-card.old .d {
    color: rgba(247,241,232, 0.45);
  }
  body section:not(.paper) .timeline .tl-card.old .h {
    color: #FFFFFF;
  }
  body section:not(.paper) .timeline .tl-card.old .t {
    color: rgba(247,241,232, 0.72);
  }

  body section:not(.paper) .dtable {
    border-top-color: rgba(247,241,232, 0.16);
  }
  body section:not(.paper) .dt-row {
    border-top-color: rgba(247,241,232, 0.10);
  }
  body section:not(.paper) .dt-row .c {
    color: rgba(247,241,232, 0.72);
  }
  body section:not(.paper) .dt-row .c.b {
    color: #FFFFFF;
  }

  body section:not(.paper) .clist .row {
    border-top-color: rgba(247,241,232, 0.10);
  }
  body section:not(.paper) .clist .desc {
    color: rgba(247,241,232, 0.72);
  }

  body section:not(.paper) .highlight {
    background: #2B241D;
    border: 1.5px solid rgba(247,241,232, 0.14);
  }
  body section:not(.paper) .highlight .sub {
    color: rgba(247,241,232, 0.72);
  }

  body section:not(.paper) .diag-bars .panel {
    background: #2B241D;
    border-color: rgba(247,241,232, 0.10);
  }
  body section:not(.paper) .diag-bars .panel.loser {
    border-color: rgba(114,99,88, 0.3);
  }
  body section:not(.paper) .diag-bars .panel .foot {
    color: #FF7A45;
  }
  body section:not(.paper) .diag-bars .panel.loser .foot {
    color: #726358;
  }

  body section:not(.paper) .quote-inset {
    background: #2B241D;
    border-left-color: ${VOUR_ORANGE};
  }
  body section:not(.paper) .quote-inset::before { color: ${VOUR_ORANGE_BRIGHT}; }
  body section:not(.paper) .qi-body {
    color: #FFFFFF;
  }
  body section:not(.paper) .qi-author { color: ${VOUR_MIST_MUTED}; }

  body section:not(.paper) .mock {
    background: #2B241D;
    border-color: rgba(247,241,232, 0.16);
  }
  body section:not(.paper) .mock-head {
    color: rgba(247,241,232, 0.45);
    border-bottom-color: rgba(247,241,232, 0.14);
  }
  body section:not(.paper) .mock-field {
    background: #1C0A05;
    border-color: rgba(247,241,232, 0.16);
    color: #FFFFFF;
  }

  /* ═══ Cover dark surface — a third background variant, heavier than body dark ═══
     The cover carries more light than an interior slide so the first frame of the
     carousel has more presence in a feed. Every stop stays inside the 5-10% band the
     brand allows; the extra weight comes from a third glow and wider falloff, not from
     turning the opacity up until the background stops being Ink. */
  section.cover-ink { position: relative; }
  section.cover-ink::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(70% 50% at 100% 0%, rgba(255,122,69,0.07), transparent 62%),
      radial-gradient(60% 46% at 0% 100%, rgba(238,75,26,0.05), transparent 66%),
      radial-gradient(90% 60% at 50% 55%, rgba(255,122,69,0.035), transparent 70%);
  }
  section.cover-ink > * { position: relative; z-index: 1; }
  /* …except the ghost numeral, which must stay out of flow. "section.cover-ink > *"
     (0-1-1) outranks ".ce-ghost" (0-1-0), so without this the numeral is laid out
     as a relative block at the top of the column and eats the cover's free space. */
  section.cover-ink > .ce-ghost { position: absolute; }
  /* Cover anchor wrapper — centers the single visual anchor in the free space */
  .anchor-wrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .anchor-wrap > * { max-width: 100%; max-height: 100%; }

  /* Scope div for a custom mockup/hook. It exists only to give the fragment's CSS
     a scope root, so it must not behave like a box: it fills its slot and passes
     the centering through, otherwise it shrink-wraps as a flex item and a
     width:100% inside the fragment resolves against the fragment's own content. */
  .diag-wrap > .cm,
  .anchor-wrap > .cm {
    width: 100%; min-height: 0; max-height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .diag-wrap > .cm > *,
  .anchor-wrap > .cm > * { max-width: 100%; }

  /* Readable defaults for a sanitized custom fragment.

     sanitizeCustomHtml strips every style= attribute, every <style> block and every
     non-whitelisted class, so a fragment arrives with no appearance of its own. Without
     these rules it would render as browser-default black Times on the Ink canvas —
     invisible, and the reason "just strip the styling" needs a floor under it. Everything
     here reads surface tokens, so it is correct on Ink and Paper with no per-surface rule. */
  .cm-base { flex-direction: column; gap: 16px; text-align: left;
    font-family: 'Inter', system-ui, sans-serif; color: var(--ms-fg);
    font-size: 30px; line-height: 1.45;
    /* The fragment is a panel, not loose text on the canvas. Without this it renders as
       a bare paragraph floating in the diagram well, which reads as a slide that failed
       to render rather than as a deliberate mockup. Every value is a surface token, so
       one rule is correct on both Ink and Paper. */
    width: 100%; padding: 36px 40px;
    background: var(--ms-panel); border: 1.5px solid var(--ms-line);
    border-radius: 20px;
    /* Tinted to the canvas, never pure black — see the shadow note in DESIGN.md. */
    box-shadow: 0 16px 40px rgba(28,10,5, 0.10); }
  /* justify-content:center on .cm would push a short fragment's children apart once
     .cm-base makes it a real box; keep the content stacked from the top. */
  .diag-wrap > .cm.cm-base,
  .anchor-wrap > .cm.cm-base { justify-content: flex-start; align-items: stretch; }
  .cm-base p, .cm-base li, .cm-base td, .cm-base th, .cm-base div, .cm-base span {
    color: var(--ms-fg); font-size: inherit; line-height: inherit; }
  .cm-base h1, .cm-base h2, .cm-base h3, .cm-base h4, .cm-base h5, .cm-base h6 {
    color: var(--ms-fg); font-weight: 700; font-size: 38px; line-height: 1.2; margin: 0; }
  .cm-base strong, .cm-base b { color: var(--ms-accent); font-weight: 700; }
  .cm-base code, .cm-base pre, .cm-base kbd {
    font-family: 'JetBrains Mono', monospace; font-size: 26px;
    background: var(--ms-panel-deep); color: var(--ms-fg);
    border: 1px solid var(--ms-line); border-radius: 8px; padding: 2px 8px; }
  .cm-base pre { padding: 16px 20px; overflow: hidden; white-space: pre-wrap; }
  .cm-base ul, .cm-base ol { margin: 0; padding-left: 32px; display: flex;
    flex-direction: column; gap: 10px; }
  .cm-base table { width: 100%; border-collapse: collapse; }
  .cm-base th, .cm-base td { border: 1px solid var(--ms-line); padding: 12px 16px;
    text-align: left; }
  .cm-base th { font-weight: 700; background: var(--ms-panel-deep); }
  .cm-base img, .cm-base svg { max-width: 100%; height: auto; }
  .cm-base hr { border: 0; border-top: 1px solid var(--ms-line); width: 100%; }

  /* Cover CTA follows the cover-slides.html prototype: the last FLOW child, not an
     absolutely-positioned overlay. carousel-css.ts (DO-NOT-EDIT) pins .geser with
     position:absolute, which takes it out of the column — .anchor-wrap{flex:1} then
     expands through the CTA band and the anchor sits on top of "Geser". Going back
     to static makes the CTA reserve its own band, and its left edge falls on the
     content box (the same 80px grid as the eyebrow and headline) instead of being
     measured separately. */
  /* Rule + uppercase treatment for EVERY cover, not just the Ink one. These lived under
     "section.cover-ink" and the accent colour with them, so a cover that resolved to a
     Paper surface shipped a grey lowercase "Geser →" with no rule at all — the reported
     "only the line beside it is coloured" was the inverse case: the rule was the one
     part that had a colour of its own. The rule now inherits currentColor, so text,
     arrow and rule cannot drift apart again. */
  .geser {
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .geser::before {
    content: "";
    width: 56px; height: 2px;
    background: currentColor;
    border-radius: 1px;
    flex: none;
  }
  section.cover-ink .geser {
    position: static;
    margin-top: 32px;
  }

  /* Cover anchor — ID badge (NOT .badge; that is the step-number badge) */
  .cover-badge { position: relative; width: 560px; padding: 48px 44px 44px; border-radius: 26px;
    background: #2B241D; border: 1.5px solid #382E25; transform: rotate(-4deg);
    box-shadow: 0 40px 90px rgba(28,10,5,0.55); }
  .cover-badge .hole { position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
    width: 120px; height: 16px; border-radius: 8px; background: #1C0A05; border: 1.5px solid #382E25; }
  .cover-badge .brow { display: flex; align-items: center; gap: 12px; margin-top: 20px;
    font-family: 'JetBrains Mono'; font-size: 22px; color: rgba(247,241,232,0.45); letter-spacing: 0.08em; }
  .cover-badge .role { font-family: 'Sora'; font-weight: 800; font-size: 72px; line-height: 1;
    color: #FFFFFF; margin-top: 22px; }
  .cover-badge .sub { font-family: 'JetBrains Mono'; font-size: 24px; color: rgba(247,241,232,0.45); margin-top: 14px; }
  .cover-badge .cover-strike { position: absolute; left: -10px; right: -10px; top: 56%; height: 12px;
    border-radius: 6px; background: #FF7A45; transform: rotate(-9deg); box-shadow: 0 8px 30px rgba(255,122,69,0.5); }

  /* Cover anchor — NOC status grid */
  .cover-noc { width: 100%; max-width: 840px; }
  .cover-noc .grid { display: grid; gap: 14px; }
  .cover-noc .node { aspect-ratio: 1; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
  .cover-noc .node.down { background: rgba(114,99,88,0.16); border: 1.5px solid #726358; box-shadow: inset 0 0 24px rgba(114,99,88,0.25); }
  .cover-noc .node.up { background: rgba(53,107,52,0.14); border: 1.5px solid #356B34; box-shadow: inset 0 0 24px rgba(53,107,52,0.20); }
  .cover-noc .banner { margin-top: 28px; display: flex; align-items: center; justify-content: center; gap: 14px;
    font-family: 'JetBrains Mono'; font-size: 38px; font-weight: 600; letter-spacing: 0.08em; color: #B0A49A; }
  .cover-noc .node svg { display: block; }

  /* Cover anchor — Norman door (pull handle contradicts the label) */
  .cover-door { position: relative; width: 340px; height: 460px; border-radius: 16px;
    background: #2B241D; border: 1.5px solid #382E25; display: flex; align-items: center; justify-content: flex-end;
    padding-right: 30px; box-shadow: 0 40px 90px rgba(28,10,5,0.55); }
  .cover-door .label { position: absolute; top: 34px; left: 0; right: 0; text-align: center;
    font-family: 'JetBrains Mono'; font-size: 34px; font-weight: 600; letter-spacing: 0.22em; color: #FF7A45; }
  .cover-door .handle { width: 26px; height: 200px; border-radius: 13px; background: #FFFFFF; box-shadow: 0 8px 24px rgba(28,10,5,0.4); }
  .cover-door .hand { position: absolute; right: -6px; top: 50%; transform: translateY(-50%); }
  .cover-door .hand svg { display: block; }

  /* ═══ v1.0 Stage-B mockups — browser · quote · datatable · commandlist · timeline ═══ */

  /* Browser window */
  .browser { width: 100%; border: 1.5px solid #1C0A05; border-radius: 24px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(28,10,5,0.10); background: #FFFFFF; }
  .b-chrome { background: #FBF6EF; border-bottom: 1.5px solid rgba(28,10,5,0.14);
    padding: 20px 24px; display: flex; align-items: center; gap: 20px; }
  .b-dots { display: flex; gap: 8px; }
  .b-dots i { width: 14px; height: 14px; border-radius: 50%; display: block; }
  .b-dots .r { background: #A0503A; } .b-dots .y { background: #C08A3A; } .b-dots .g { background: #86C97F; }
  .b-url { flex: 1; background: #FBF6EF; border: 1px solid rgba(28,10,5,0.14); border-radius: 999px;
    padding: 10px 24px; font-family: 'JetBrains Mono'; font-size: 20px; color: #6E4B3E; }
  .b-main { padding: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .b-card { border: 1.5px solid rgba(28,10,5,0.14); border-radius: 16px; min-height: 150px;
    background: #FBF6EF; display: flex; flex-direction: column; justify-content: flex-end; padding: 20px; }
  .b-card .t { font-family: 'Sora'; font-weight: 700; font-size: 40px; color: #1C0A05; line-height: 1.1; }
  .b-card .s { font-family: 'JetBrains Mono'; font-size: 20px; color: #6E4B3E; margin-top: 4px; }

  /* Quote inset (EB Garamond) — a colour panel with an oversized quote mark, the most
     recognisably magazine object in the set. The mark is DECORATIVE (the quote reads
     without it) and it is set at 150px, so 3:1 is its bar twice over: the brand ember is
     3.14:1 on the peach wash and 4.65:1 on charcoal. The attribution below it stays
     neutral, because that IS small text. */
  .quote-inset { position: relative; width: 100%; border-left: 6px solid ${VOUR_ORANGE};
    background: ${VOUR_ORANGE_WASH};
    border-radius: 4px; padding: 40px 48px 40px 96px; }
  .quote-inset::before {
    content: "\201C";
    position: absolute; top: 6px; left: 26px;
    font-family: 'EB Garamond', Georgia, serif; font-weight: 700;
    font-size: 150px; line-height: 1; color: ${VOUR_ORANGE};
    pointer-events: none;
  }
  .qi-body { font-family: 'EB Garamond', Georgia, serif; font-style: italic; font-weight: 500;
    font-size: 48px; line-height: 1.35; color: #1C0A05; }
  .qi-author { font-family: 'JetBrains Mono'; font-size: 24px; color: ${VOUR_SLATE}; margin-top: 24px;
    letter-spacing: 0.08em; text-transform: uppercase; }

  /* Data table ✗/✓ */
  .dtable { width: 100%; border-top: 1.5px solid #1C0A05; }
  .dt-hr { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; font-family: 'JetBrains Mono';
    font-size: 24px; letter-spacing: 0.1em; text-transform: uppercase; padding: 20px 0; }
  .dt-hr .no { color: #726358; } .dt-hr .ok { color: #356B34; }
  .dt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
    border-top: 1px solid rgba(28,10,5,0.10); padding: 26px 0; }
  .dt-row .c { font-family: 'Inter'; font-size: 28px; line-height: 1.35; color: #3D2419; }
  .dt-row .c.b { color: #1C0A05; font-weight: 600; }

  /* Command list */
  .clist { width: 100%; display: flex; flex-direction: column; }
  .clist .row { display: flex; align-items: baseline; gap: 32px; padding: 24px 0;
    border-top: 1.5px solid rgba(28,10,5,0.10); }
  .clist .row:first-child { border-top: none; }
  .clist .cmd { font-family: 'JetBrains Mono'; font-size: 34px; color: #EE4B1A; min-width: 280px; }
  .clist .desc { font-family: 'Inter'; font-size: 28px; color: #3D2419; }

  /* Timeline (then / now) */
  .timeline { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .tl-card { border-radius: 20px; padding: 36px 32px; }
  .tl-card.old { background: #EDE7DA; }
  .tl-card.new { background: #FBE9D9; border: 2px solid #EE4B1A; }
  .tl-card .d { font-family: 'JetBrains Mono'; font-size: 22px; letter-spacing: 0.12em;
    text-transform: uppercase; color: #6E4B3E; }
  .tl-card.new .d { color: #B8380E; }
  .tl-card .h { font-family: 'Sora'; font-weight: 700; font-size: 36px; color: #1C0A05; margin-top: 14px; line-height: 1.15; }
  .tl-card .t { font-family: 'Inter'; font-size: 26px; color: #3D2419; margin-top: 12px; line-height: 1.4; }

  /* ═══ v1.0 TASK-1 mockups — promptcard · foldertree · commandpalette · database · gitbranch ═══ */

  /* Prompt card — copy-paste AI prompt, 2px ember border + corner label */
  .prompt { position: relative; border: 2px solid #EE4B1A; border-radius: 20px;
    padding: 44px 40px 40px; background: #FFFFFF; }
  .prompt .lbl { position: absolute; top: -16px; left: 32px; background: #FBF6EF; padding: 0 14px;
    font-family: 'JetBrains Mono'; font-size: 20px; letter-spacing: 0.18em;
    text-transform: uppercase; color: #B8380E; }
  .prompt pre { font-family: 'JetBrains Mono'; font-size: 30px; line-height: 1.55;
    color: #1C0A05; white-space: pre-wrap; }

  /* Folder tree — mono directory listing, active row in the brand accent */
  .tree { width: 100%; background: #FFFFFF; border: 1.5px solid rgba(28,10,5,0.14);
    border-radius: 20px; padding: 40px 44px; font-family: 'JetBrains Mono'; font-size: 30px;
    line-height: 1.7; color: #3D2419; white-space: pre-wrap; }
  .tree .on { color: #EE4B1A; font-weight: 600; }

  /* Command palette — Cmd+K menu on Ink surface */
  .cmdp { width: 100%; background: #2B241D; border: 1.5px solid #382E25; border-radius: 20px;
    overflow: hidden; box-shadow: 0 30px 70px rgba(28,10,5,0.4); }
  .cmdp .search { padding: 28px 32px; border-bottom: 1px solid #382E25;
    display: flex; align-items: center; gap: 16px; }
  .cmdp .search .car { color: #FF7A45; font-family: 'JetBrains Mono'; font-size: 30px; }
  .cmdp .search .q { font-family: 'JetBrains Mono'; font-size: 30px; color: #FFFFFF; }
  .cmdp .row { padding: 22px 32px; display: flex; align-items: center; gap: 20px;
    font-family: 'JetBrains Mono'; font-size: 28px; color: rgba(247,241,232,0.72); }
  .cmdp .row.on { background: #382E25; color: #FFFFFF; }
  .cmdp .row svg { flex: none; }
  .cmdp .row .k { margin-left: auto; font-size: 20px; color: rgba(247,241,232,0.45); }

  /* Database — two related tables + relation glyph */
  .db { width: 100%; display: flex; align-items: center; justify-content: center;
    gap: 48px; flex-wrap: wrap; }
  .db .table { border: 1.5px solid #1C0A05; border-radius: 16px; overflow: hidden;
    min-width: 300px; background: #FFFFFF; }
  .db .table .th { background: #1C0A05; color: #FFFFFF; font-family: 'JetBrains Mono';
    font-size: 26px; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  .db .table .tr { padding: 14px 24px; font-family: 'JetBrains Mono'; font-size: 24px;
    color: #3D2419; border-top: 1px solid rgba(28,10,5,0.10);
    display: flex; justify-content: space-between; gap: 24px; }
  .db .table .tr .ty { color: #7E6153; }
  .db .rel { font-family: 'JetBrains Mono'; font-size: 28px; color: #EE4B1A; }

  /* Git branch — fixed 2-branch SVG diagram */
  .git { width: 100%; position: relative; padding: 40px 20px; }
  .git svg { width: 100%; height: 300px; display: block; }

  /* Illustration — unDraw SVG for abstract concepts / analogies.

     Sized by HEIGHT, not by a square box. 123 of the 145 allowlisted illustrations are
     landscape (median viewBox ratio 1.29, up to 2.86), so a fixed
     width:500px + height:500px letterboxed them: a 2.86-ratio drawing became 240×84 floating
     in a 240×240 slot, which reads as "the illustration came out tiny". Pinning the
     height and letting width follow the viewBox gives every slug the same visual weight.

     The height is a CEILING, not a fixed value. align-self:stretch hands
     .diag-illustration the full height of .diag-wrap, which flex has already made
     definite; the group then takes what the caption leaves and max-height:100% clamps
     the drawing to it. A fixed height cannot work here because the space a point slide
     leaves swings with the headline: measured on the real 1080×1350 canvas, .diag-wrap
     is 920×733 under a two-line headline but only 920×459 under a four-line one. The
     previous fixed 440px looked right in the roomy case and, in the tight one, pushed a
     626px block out of a 459px well — overlapping the body text above and running 4px
     off the bottom of the canvas. */
  .diag-illustration { width: 100%; align-self: stretch; min-height: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 16px; padding: 16px 0; }
  /* The caption keeps its natural height; the illustration is what gives way. */
  .diag-illustration > .catatan { flex: none; width: 100%; }

  /* One layout for 1 and 2 illustrations — the count only changes the size class, so
     the single and pair cases cannot drift apart. justify-content:center (NOT
     space-between) keeps a pair together instead of shoving each to an edge. */
  .illustration-group { display: flex; flex-direction: row;
    align-items: center; justify-content: center; gap: 28px; flex-wrap: nowrap;
    width: 100%; flex: 1 1 auto; min-height: 0; }
  .illustration-group .illus-item { display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    flex-shrink: 0; min-width: 0; height: 100%; min-height: 0; }
  .illustration-group .illus-item svg { display: block; flex-shrink: 0;
    width: auto; max-height: 100%; }
  /* max-width caps the panoramas (up to 2.86:1) so they cannot run past the 920px
     content column (1080 canvas − 80px padding per side).

     Single: 500px tall, capped at 900px wide so even a 2.86:1 panorama keeps a 20px
     margin inside the column.

     Pair: the width cap binds first — two items plus the 28px gap must fit 920px, so
     446px each. 420px of height is what a portrait slug can use before that cap takes
     over; a 1.29:1 slug wants 542px at that height and letterboxes down to ~346px
     inside its box. Equal boxes across the pair are worth the letterboxing. */
  .illustration-group.is-single .illus-item svg { height: 500px; max-width: 900px; }
  .illustration-group.is-pair   .illus-item svg { height: 420px; max-width: 446px; }

  /* Screenshot evidence — uploaded real evidence image or pending placeholder */
  .diag-screenshot { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .diag-screenshot img { max-width: 100%; max-height: 480px; width: auto; height: auto; border-radius: 16px; border: 1.5px solid rgba(28,10,5,0.18); box-shadow: 0 16px 40px rgba(28,10,5,0.12); object-fit: contain; }
  .diag-screenshot-placeholder { width: 100%; padding: 36px 32px; border: 2px dashed #EE4B1A; border-radius: 20px; background: rgba(238,75,26,0.05); display: flex; flex-direction: column; gap: 14px; text-align: left; }
  .diag-screenshot-badge { font-family: 'JetBrains Mono'; font-weight: 700; font-size: 22px; color: #B8380E; letter-spacing: 0.08em; text-transform: uppercase; }
  .diag-screenshot-source { font-size: 26px; line-height: 1.4; color: #1C0A05; font-weight: 600; }
  .diag-screenshot-source span { color: #B8380E; }
  .diag-screenshot-brief-item { font-size: 22px; line-height: 1.4; color: #7E6153; }
  .diag-screenshot-brief-item strong { color: #1C0A05; }
`;
