// Verbatim <section> markup for the outro role, copied from
// "design-system/TEMPLATE-editorial-v3.html" (§ "SLIDE · OUTRO").
// Restores the bundle's counter/eyebrow + .highlight CTA block (strong + sub);
// every {{slot}} here maps to a var renderSlide produces.
export const outroTemplate = String.raw`<section class="{{surfaceClass}}" data-screen-label="Outro">
  {{#eyebrow}}
  <div class="eyebrow mt-64">{{eyebrow}}</div>
  {{/eyebrow}}
  <h1 class="mt-24">{{headlinePre}}<span class="a">{{accentWord}}</span>{{headlinePost}}</h1>
  {{#body}}
  <p class="body-text mt-32">
    {{body}}
  </p>
  {{/body}}

  <div class="highlight mt-40">
    <div class="strong">{{ctaStrong}}</div>
    {{#ctaSub}}<div class="sub">{{ctaSub}}</div>{{/ctaSub}}
  </div>

  <div class="brand-row" style="margin-top:auto; padding-top:32px;">
    <div class="brand-disc">
      <img src="{{brand}}" alt="@vourdev">
    </div>
    <span class="brand-handle">@vourdev</span>
  </div>
</section>`;
