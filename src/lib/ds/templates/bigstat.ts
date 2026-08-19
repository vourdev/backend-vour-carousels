// BigStat mockup — one standout metric in editorial style.
// Adapted from "design-system" BigStat component.
// Colours come from the --ms-* surface tokens (carousel-css-extra.ts): these are
// inline styles, so a per-surface CSS rule could not reach them and the unit line
// rendered near-black on the near-black Ink canvas.
export const bigstatTemplate = String.raw`<div class="diag-wrap mt-40">
    <div style="text-align:center;width:100%;padding:24px 0">
      <div style="font-family:'Sora',sans-serif;font-weight:800;font-size:96px;color:var(--ms-accent);line-height:1">{{bigstatNumber}}</div>
      {{#bigstatUnit}}
      <div style="font-family:'Sora',sans-serif;font-weight:700;font-size:40px;color:var(--ms-fg);margin-top:8px;line-height:1.2">{{bigstatUnit}}</div>
      {{/bigstatUnit}}
      <div style="font-family:'Inter',sans-serif;font-weight:500;font-size:32px;color:var(--ms-fg-muted);margin-top:16px;line-height:1.3;max-width:800px;margin-left:auto;margin-right:auto">{{bigstatCaption}}</div>
    </div>
  </div>`;
