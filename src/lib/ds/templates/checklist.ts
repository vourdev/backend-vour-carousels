// Recap-checklist mockup — ticked list. Adapted from
// "design-system/TEMPLATE-editorial-v3.html" (§ "D9 · Recap checklist").
//
// Wrapped in .diag-wrap like every other mockup. Without it the list was a bare
// flex child pinned right under the body copy: no breathing room above, and a
// six-item recap ran off the bottom of the 1350px canvas instead of shrinking
// into the free space.
export const checklistTemplate = String.raw`<div class="diag-wrap mt-40">
    <ul class="checklist">CHECKLIST_ITEMS_INJECT</ul>
  </div>
  NOTE_INJECT`;
