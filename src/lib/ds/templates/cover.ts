// Verbatim <section> markup for the cover role, copied from
// "design-system/TEMPLATE-editorial-v3.html" (§ "SLIDE 1 · COVER").
// [bracket] placeholders rewritten as {{slot}} markers matching Slide["cover"] fields.
export const coverTemplate = String.raw`<section data-screen-label="01 · Cover" class="cover-editorial {{coverSurface}}">
  <div class="brand-row">
    <div class="brand-disc">
      <img src="{{brand}}" alt="@vourdev">
    </div>
    <span class="brand-handle">@vourdev</span>
  </div>

  <div class="cover-lead">
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
