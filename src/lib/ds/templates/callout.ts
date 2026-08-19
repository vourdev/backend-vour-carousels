// DarkCallout mockup — high-contrast banner with icon for key takeaways.
// Adapted from "design-system" DarkCallout component.
//
// The banner INVERTS against its surface (--ms-invert-*): near-black on Paper,
// cream on Ink. It used to be a hard-coded #000000 panel, which on the Ink
// canvas (#000000) meant an invisible callout — the emphasis component being
// the least visible thing on the slide.
export const calloutTemplate = String.raw`<div class="diag-wrap mt-40">
    <div style="background:var(--ms-invert-bg);border-radius:20px;padding:26px 30px;display:flex;align-items:flex-start;gap:20px;width:100%">
      <div class="callout-ico" style="min-width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none">
        ICON_INJECT
      </div>
      <div style="font-family:'Inter',sans-serif;font-weight:600;font-size:26px;color:var(--ms-invert-fg);line-height:1.4;word-break:break-word">{{calloutText}}</div>
    </div>
  </div>`;
