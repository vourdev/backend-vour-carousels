// Quote-inset mockup — editorial pull-quote (EB Garamond italic) + attribution.
// v1.0 "Engineering Editorial". Fixed slots → fillTemplate (auto-escaped).
export const quoteTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="quote-inset">
      <div class="qi-body">{{quote}}</div>
      {{#author}}<div class="qi-author">{{author}}</div>{{/author}}
    </div>
  </div>`;
