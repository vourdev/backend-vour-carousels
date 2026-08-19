// Cover anchor — NOC status grid. NODES_INJECT is filled with cols*rows nodes,
// GRID_COLS_INJECT with the column count, BANNER_INJECT with the banner row.
export const coverNocGridTemplate = String.raw`<div class="anchor-wrap">
  <div class="cover-noc">
    <div class="grid" style="grid-template-columns:repeat(GRID_COLS_INJECT,1fr)">NODES_INJECT</div>
    <div class="banner">BANNER_INJECT</div>
  </div>
</div>`;
