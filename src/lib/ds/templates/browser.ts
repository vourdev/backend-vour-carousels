// Browser-window mockup — chrome + URL pill + stat-card grid (dashboard look).
// v1.0 "Engineering Editorial". Cards + url injected via sentinels (raw HTML).
export const browserTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="browser">
      <div class="b-chrome">
        <span class="b-dots"><i class="r"></i><i class="y"></i><i class="g"></i></span>
        <span class="b-url">BROWSER_URL_INJECT</span>
      </div>
      <div class="b-main">BROWSER_CARDS_INJECT</div>
    </div>
  </div>
  NOTE_INJECT`;
