// Terminal mockup — Mac-style window with syntax-highlighted code lines.
// Adapted from "design-system/TEMPLATE-editorial-v3.html" (§ "D8 · Terminal code").
// Lines are injected as raw HTML via TERMINAL_LINES_INJECT sentinel (since fillTemplate escapes values).
export const terminalTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="terminal">
      <div class="terminal-bar">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="title">{{terminalFilename}}</span>
      </div>
<div class="terminal-body">TERMINAL_LINES_INJECT</div>
    </div>
  </div>`;

