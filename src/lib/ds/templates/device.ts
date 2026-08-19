// Synthetic device/window frame for the cover hook. Reuses the terminal chrome
// (.terminal, .terminal-bar, mac dots). BAR_LABEL_INJECT carries either a
// .urlbar pill (browser) or a .title filename (terminal); DEVICE_LINES_INJECT
// carries the syntax-styled body lines. Both are raw-injected (not fillTemplate).
export const deviceTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="terminal">
      <div class="terminal-bar">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        BAR_LABEL_INJECT
      </div>
<div class="terminal-body">DEVICE_LINES_INJECT</div>
    </div>
  </div>`;
