// Data-table mockup — ✗/✓ two-column comparison ("jangan / lakukan").
// v1.0 "Engineering Editorial". Labels + rows injected via sentinels.
export const dataTableTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="dtable">
      <div class="dt-hr"><span class="no">✗ DT_NO_INJECT</span><span class="ok">✓ DT_OK_INJECT</span></div>
      DT_ROWS_INJECT
    </div>
  </div>`;
