// Myth/fact mockup — the misconception, the correction, and why it matters.
//
// The single most common shape in the deck history ("JWT Itu Bukan Enkripsi",
// "Server Actions: Public Endpoint yang Sering Dikira Aman", "Index Nggak Selalu
// Bikin Query Cepat"). It was being forced into `datatable`, whose 50-character
// paired cells cannot hold a claim, its correction and the reason at once.
export const mythFactTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="mf">
      <div class="mf-row mf-myth">
        <span class="mf-tag">MITOS</span>
        <span class="mf-text">MF_MYTH_INJECT</span>
      </div>
      <div class="mf-row mf-fact">
        <span class="mf-tag">FAKTANYA</span>
        <span class="mf-text">MF_FACT_INJECT</span>
      </div>
      MF_WHY_INJECT
    </div>
  </div>`;
