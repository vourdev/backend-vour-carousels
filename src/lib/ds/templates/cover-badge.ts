// Cover anchor — ID badge, optionally struck through with an accent bar.
// Ported from the approved cover-slides preview (DevOps cover). Sentinels are
// filled by renderBadgeHook (all user text escaped there).
export const coverBadgeTemplate = String.raw`<div class="anchor-wrap">
  <div class="cover-badge">
    <div class="hole"></div>
    <div class="brow">BADGE_BROW_INJECT</div>
    <div class="role">BADGE_ROLE_INJECT</div>
    BADGE_SUB_INJECT
    BADGE_STRIKE_INJECT
  </div>
</div>`;
