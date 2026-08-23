// Verbatim <section> markup for the point role, copied from
// "design-system/TEMPLATE-editorial-v3.html" (§ "SLIDE · POINT (with full info card)").
// [bracket] placeholders rewritten as {{slot}} markers matching Slide["point"] fields.
// The info card is always present in the source markup; it is wrapped in
// {{#card}}…{{/card}} here so slides without a `card` field omit it entirely.
//
// `.slide-point` is what scopes the shared reading-order slots in
// carousel-css-extra.ts. Those slots are the only thing keeping the headline near the
// top whichever composition the plan picks, so the class is not decorative — a point
// section without it falls back to raw DOM order and every layout- rule stops applying.
//
// DOM order here is the reading order of the "standard" composition. The alternative
// compositions re-slot these same nodes; none of them adds or removes one.
export const pointTemplate = String.raw`<section class="slide-point {{surfaceClass}} layout-{{layout}}" data-screen-label="03 · Point">
  <div class="counter">{{counter}}</div>

  <div class="eyebrow {{eyebrowClass}} mt-64">{{eyebrow}}</div>
  <h1 class="compact mt-24">{{headlinePre}}<span class="a">{{accentWord}}</span>{{headlinePost}}</h1>
  <p class="body-text mt-32">
    {{body}}
  </p>

  {{#card}}
  <div class="card card-{{cardTone}} mt-40">
    <div class="card-head">
      <div class="card-ico">
        ICON_INJECT
      </div>
      <div class="card-title">{{cardTitle}}</div>
    </div>
    <div class="card-body">
      {{cardBody}}
    </div>
  </div>
  {{/card}}
  {{#mockupHtml}}
  MOCKUP_INJECT
  {{/mockupHtml}}
</section>`;
