import { stripEmoji } from "../ds/strip-emoji";

/**
 * Markdown bold, promoted to the deck's accent span.
 *
 * The brief prompt asks the model to mark the accent word as `**word**`, and the plan step
 * is supposed to lift that into the separate `accentWord` field. When it forgets, the
 * asterisks travel all the way to the canvas and print literally — a headline shipped
 * reading "Kirim **payload** ke worker". Deleting the markers would lose the emphasis the
 * model meant, so they are converted into the highlight the deck already has rather than
 * stripped.
 *
 * Runs after escaping, so the span is the only markup in the result and everything inside
 * it is already inert.
 */
function accentMarkdown(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<span class="a">$1</span>');
}

/**
 * Escape a value for HTML, drop colour emoji, and convert markdown emphasis.
 *
 * Every piece of model-authored copy reaches the page through here, which makes it the
 * one place that can guarantee no glyph paints its own colour onto a deck whose palette
 * is otherwise fully controlled. See lib/ds/strip-emoji.ts for why CSS cannot do it.
 *
 * The accent conversion emits an element, so this must never fill an attribute holding
 * free-form copy. Today it cannot: every `{{slot}}` sitting inside an attribute across
 * lib/ds/templates carries a renderer-derived or schema-enumerated value (surface, layout,
 * tone, HTTP method, brand src), none of which can contain an asterisk. A template that
 * puts model prose in an attribute would break that, and test/ds/fill.test.ts holds the
 * line.
 */
export function escapeHtml(s: string): string {
  return accentMarkdown(
    stripEmoji(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  );
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  // 1. Resolve optional blocks {{#key}}…{{/key}} first.
  let out = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key: string, inner: string) => (vars[key] ? inner : "")
  );
  // 2. Replace named slots {{key}} with escaped values (blank if missing).
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    vars[key] != null ? escapeHtml(vars[key]) : ""
  );
  return out;
}
