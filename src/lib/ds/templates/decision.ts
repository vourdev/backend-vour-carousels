// Decision-guide mockup — 2-3 options, each with the condition that selects it.
//
// Deliberately has no winner. `comparison` paints a loser in stone and a winner in
// peach, `datatable` is "jangan / lakukan" and `timeline` is "dulu / sekarang" — all
// three declare an answer. The recurring "kapan pakai yang mana" deck ("REST vs
// GraphQL", "On-Prem vs Cloud", "/24, /29 atau /30") has no answer to declare; the
// answer is the reader's situation. Every option here carries equal visual weight.
export const decisionTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="dec">
      <div class="dec-q">DEC_Q_INJECT</div>
      <div class="dec-grid">DEC_OPTS_INJECT</div>
    </div>
  </div>
  NOTE_INJECT`;
