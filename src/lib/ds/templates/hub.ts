// Icon-hub mockup — center → tool glyphs. Adapted from
// "design-system/TEMPLATE-editorial-v3.html" (§ "D5 · Icon hub").
// Tool glyphs are injected as inline allowlist SVGs; `.glyph svg` CSS sizes/colors them.
export const hubTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="diag-icon-hub">
      <div class="center"><div class="node filled big">HUB_CENTER_INJECT</div></div>
      HUB_LINES_INJECT
      <div class="tools">HUB_TOOLS_INJECT</div>
    </div>
  </div>
  NOTE_INJECT`;
