/** Generate the curved connector SVG (center → N nodes) for the hub/concept
    diagrams. Endpoints match the flexbox space-between layout of `.children` /
    `.tools`. Supports 2, 3, or 4 nodes; anything larger clamps to 4.

    Stroke/fill are set as inline SVG presentation attributes rather than via
    the `.stroke`/`.head` CSS classes in carousel-css.ts: html-to-image (the
    client export pipeline in lib/export/capture.ts) does not inline computed
    styles for SVG descendants, so class-based styling silently drops during
    export — paths fall back to default SVG fill (solid black), rendering as
    thick black wedges instead of thin orange lines. Inline attributes survive
    that pipeline and render identically in the live preview iframe. */
export function diagLines(
  count: number,
  o: { viewH: number; midY: number; endY: number; dashed?: boolean }
): string {
  const n = count <= 2 ? 2 : count === 3 ? 3 : 4;
  const xs = n === 2 ? [110, 810] : n === 3 ? [110, 460, 810] : [110, 343, 577, 810];
  const headTop = o.endY - 4;
  const headBot = o.endY + 8;
  const strokeAttrs = `stroke="#EE4B1A" stroke-width="1.5" fill="none"${o.dashed ? ' stroke-dasharray="6 6"' : ""}`;
  const paths = xs
    .map((x) => `<path ${strokeAttrs} d="M 460 96 Q 460 ${o.midY} ${x} ${o.endY}" />`)
    .join("");
  const heads = xs
    .map(
      (x) =>
        `<polygon fill="#EE4B1A" points="${x - 8},${headTop} ${x + 8},${headTop} ${x},${headBot}" />`
    )
    .join("");
  return `<svg class="lines" viewBox="0 0 920 ${o.viewH}" preserveAspectRatio="none">${paths}${heads}</svg>`;
}
