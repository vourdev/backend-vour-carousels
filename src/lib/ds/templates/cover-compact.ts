// Compact cover used when the cover carries a `hook`. Headline drops to
// h1.compact (88px) so the hook fits the fixed 1080×1350 canvas. HOOK_INJECT is
// replaced with the raw hook fragment; each hook renderer supplies its own
// flex container (.anchor-wrap, or .diag-wrap for the device frame).
//
// The `.ce-top` row (brand-row left + series stamp right) mirrors the text-only
// cover in cover-editorial.ts, so both covers open with the same anatomy as the
// approved cover-slides.html prototypes.
export const coverCompactTemplate = String.raw`<section data-screen-label="01 · Cover" class="{{coverSurface}}">
  <div class="ce-top">
    <div class="brand-row">
      <div class="brand-disc">
        <img src="{{brand}}" alt="@vourdev">
      </div>
      <span class="brand-handle">@vourdev</span>
    </div>
    {{#stamp}}<span class="series-stamp active">{{stamp}}</span>{{/stamp}}
  </div>

  <div class="eyebrow mt-64">{{eyebrow}}</div>
  <h1 class="compact mt-24">{{headlinePre}}<span class="a">{{accentWord}}</span>{{headlinePost}}</h1>
  {{#lede}}
  <p class="lede mt-24">
    {{lede}}
  </p>
  {{/lede}}

  HOOK_INJECT

  <div class="geser">Geser →</div>
</section>`;
