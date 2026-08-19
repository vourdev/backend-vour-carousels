// Command-palette mockup — Cmd+K menu on an Ink (dark) surface.
// v1.0 "Engineering Editorial" (SHOWCASE-mockups.html § "Command Palette").
// Query + rows injected via sentinels (query escaped, rows are raw HTML).
export const commandPaletteTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="cmdp">
      <div class="search"><span class="car">❯</span><span class="q">CMDP_QUERY_INJECT</span></div>
      CMDP_ROWS_INJECT
    </div>
  </div>`;
