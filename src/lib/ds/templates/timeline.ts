// Timeline mockup — two dated cards (then / now, dulu / sekarang).
// v1.0 "Engineering Editorial". Fixed slots → fillTemplate (auto-escaped).
export const timelineTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="timeline">
      <div class="tl-card old"><div class="d">{{oldLabel}}</div><div class="h">{{oldTitle}}</div><div class="t">{{oldBody}}</div></div>
      <div class="tl-card new"><div class="d">{{newLabel}}</div><div class="h">{{newTitle}}</div><div class="t">{{newBody}}</div></div>
    </div>
  </div>`;
