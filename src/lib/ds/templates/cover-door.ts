// Cover anchor — Norman door. LABEL_INJECT is the misleading affordance label;
// HANDLE_INJECT is the pull handle (shown unless pull:false); HAND_INJECT the hand glyph.
export const coverDoorTemplate = String.raw`<div class="anchor-wrap">
  <div class="cover-door">
    <div class="label">LABEL_INJECT</div>
    HANDLE_INJECT
    <div class="hand">HAND_INJECT</div>
  </div>
</div>`;
