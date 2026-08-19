// Numbered step cards mockup — solid accent-circled step badges.
// Adapted from "design-system" NumberedStep component + Solution recipe.
// Steps are injected as raw HTML via STEPS_HTML_INJECT sentinel.
export const stepsTemplate = String.raw`<div class="diag-wrap mt-40">
    <div style="display:flex;flex-direction:column;gap:16px;width:100%">STEPS_HTML_INJECT</div>
  </div>`;

// Single step card partial — used by render-slide.ts to build stepsHtml.
// The badge is the `.badge` component rather than an inline circle, so its colour lives
// in one CSS rule instead of in a string here. {{stepTone}} alternates the PANEL per step
// index (see renderStepsMockup); the badge is the same on every row.
export const stepCardPartial = String.raw`<div class="card {{stepTone}}" style="padding:18px 22px;display:flex;align-items:flex-start;gap:16px">
      <div class="badge" style="min-width:36px;width:36px;height:36px;font-size:18px">{{stepN}}</div>
      <div>
        <div style="font-family:'Sora',sans-serif;font-weight:700;font-size:26px;color:#000000;line-height:1.2">{{stepTitle}}</div>
        <div style="font-family:'Inter',sans-serif;font-weight:500;font-size:22px;color:#4A5C5C;margin-top:4px;line-height:1.3">{{stepBody}}</div>
      </div>
    </div>`;
