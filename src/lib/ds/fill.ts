import { stripEmoji } from "../ds/strip-emoji";

/**
 * Escape a value for HTML, and drop colour emoji on the way through.
 *
 * Every piece of model-authored copy reaches the page through here, which makes it the
 * one place that can guarantee no glyph paints its own colour onto a deck whose palette
 * is otherwise fully controlled. See lib/ds/strip-emoji.ts for why CSS cannot do it.
 */
export function escapeHtml(s: string): string {
  return stripEmoji(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
