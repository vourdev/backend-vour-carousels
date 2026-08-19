// Git-branch mockup — fixed 2-branch SVG (feature branch + merge back to main).
// v1.0 "Engineering Editorial" (SHOWCASE-mockups.html § "Git Branch"). Only the
// two variable <text> labels are parameterized (escaped in the renderer); commit
// geometry is fixed.
//
// Every stroke/fill carries a g-* class so the stylesheet can bind it to the
// --ms-* surface tokens. As raw colour attributes the main line and its commit
// dots were locked to #000000 and vanished on the near-black Ink canvas, and the
// accent parts never picked up the brighter on-dark accent.
export const gitBranchTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="git">
      <svg viewBox="0 0 920 300" fill="none">
        <line class="g-main" x1="40" y1="90" x2="880" y2="90" stroke-width="3"/>
        <path class="g-feat" d="M200 90 C 260 90 260 210 320 210 L 620 210 C 680 210 680 90 740 90" stroke-width="3" fill="none"/>
        <circle class="g-dot" cx="120" cy="90" r="16"/>
        <circle class="g-dot" cx="200" cy="90" r="16"/>
        <circle class="g-fdot" cx="400" cy="210" r="16"/>
        <circle class="g-fdot" cx="540" cy="210" r="16"/>
        <circle class="g-fdot" cx="740" cy="90" r="20"/>
        <circle class="g-dot" cx="840" cy="90" r="16"/>
        <text class="g-label" x="120" y="60" font-family="JetBrains Mono" font-size="22" text-anchor="middle">main</text>
        <text class="g-flabel" x="470" y="262" font-family="JetBrains Mono" font-size="22" text-anchor="middle">GIT_BRANCH_INJECT</text>
        <text class="g-flabel" x="740" y="55" font-family="JetBrains Mono" font-size="22" text-anchor="middle">GIT_MERGE_INJECT</text>
      </svg>
    </div>
  </div>`;
