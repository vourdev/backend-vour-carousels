// Improvised editorial-Ink intro used for the text-only cover (no hook).
// Modeled on cover-slides.html: a warm-Ink surface with an oversized ghost index
// numeral anchoring the eye at the hook word, asymmetric brand row (disc top-left,
// EB Garamond series stamp top-right), left-aligned copy weighted bottom-left, and
// "Geser" pinned bottom-left.
//
// Locked to the brand tokens: VOUR_ORANGE #EE4B1A for the display accent and ghost
// numeral, VOUR_ORANGE_BRIGHT #FF7A45 for the Ink stamps. One radius scale, no
// backdrop-filter (dies on screenshot export). All
// {{slot}} values are escaped by fillTemplate; GHOST_NUMERAL_INJECT is injected via
// the function-replacer form in renderSlide so $-sequences stay verbatim.
export const coverEditorialTemplate = String.raw`<section data-screen-label="01 · Cover" class="cover-editorial-ink {{coverSurface}}">
  <div class="ce-top">
    <div class="brand-row">
      <div class="brand-disc">
        <img src="{{brand}}" alt="@vourdev">
      </div>
      <span class="brand-handle">@vourdev</span>
    </div>
    {{#stamp}}<span class="series-stamp active">{{stamp}}</span>{{/stamp}}
  </div>

  <div class="ce-ghost" aria-hidden="true">GHOST_NUMERAL_INJECT</div>

  <div class="ce-lead">
    <div class="eyebrow">{{eyebrow}}</div>
    <h1 class="hero mt-24">{{headlinePre}}<span class="a">{{accentWord}}</span>{{headlinePost}}</h1>
    {{#lede}}
    <p class="lede mt-32">
      {{lede}}
    </p>
    {{/lede}}
  </div>

  <div class="geser">Geser →</div>
</section>`;
