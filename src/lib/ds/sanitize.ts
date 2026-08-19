// Sanitizers for the two places the model is allowed to emit raw HTML: the `custom`
// mockup and the `custom` cover hook.
//
// Output is screenshot-captured on the user's own device, so the blast radius is
// limited; the script/handler stripping below is defense-in-depth, not a full HTML
// security boundary. The styling stripping is a different concern entirely — see
// sanitizeCustomHtml.

/**
 * Utility classes a custom fragment may use.
 *
 * Curated, not generated: every class here is one whose *colour is decided by the design
 * system per surface*, so picking it cannot pick a colour. The tone classes
 * (card-peach, card-mint, mint, sky, pink, amber, loser, …) are deliberately absent —
 * each one hardcodes a literal background, so allowing them would hand colour control
 * straight back to the model through the class attribute.
 */
export const CUSTOM_CLASS_WHITELIST = [
  // layout
  "flex-col",
  "flex-grow",
  "center",
  "gap-16",
  // vertical rhythm
  "mt-8",
  "mt-16",
  "mt-24",
  "mt-32",
  "mt-40",
  "mt-48",
  "mt-64",
  // typography / content roles
  "eyebrow",
  "lede",
  "body-text",
  "highlight",
  "badge",
  "counter",
  // annotation strip
  "catatan",
  "catatan-label",
  "catatan-body",
  // generic diagram atoms
  "node",
  "chip",
] as const;

const WHITELIST = new Set<string>(CUSTOM_CLASS_WHITELIST);

/**
 * Attributes that carry presentation rather than structure. `fill`/`stroke`/`opacity`/
 * `transform` are included because inline SVG would otherwise be an unpoliced colour and
 * scale channel; `width`/`height`/`size` because they are the sizing channel that survives
 * losing `style`.
 */
const PRESENTATION_ATTRS =
  /\s(?:style|width|height|bgcolor|color|align|valign|face|size|fill|stroke|opacity|transform|hspace|vspace|border|cellpadding|cellspacing)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Strip scripts, inline event handlers, and dangerous URL schemes. */
export function sanitizeHookHtml(html: string): string {
  return html
    // Remove <script>…</script> entirely.
    .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    // Remove any dangling opening/closing script tags.
    .replace(/<\s*\/?\s*script\b[^>]*>/gi, "")
    // Remove inline event-handler attributes: on*="…" | on*='…' | on*=word.
    // The boundary char before `on` may be whitespace OR a quote/slash closing the
    // preceding attribute (`<img src="x"onerror=…>`); capture and re-emit it so the
    // handler is stripped without breaking the preceding attribute.
    // `only=` / `once=` are not event handlers; exclude them by name. The match
    // stays otherwise generic on purpose — a missed handler is a security gap,
    // while an over-strip is only cosmetic, so the default leans to stripping.
    .replace(/([\s"'/])on(?!ly\s*=|ce\s*=)[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
    // Neutralize javascript: and data:text/html URLs in href/src.
    .replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*/gi, '$1=$2#')
    // Support custom style blocks, but neutralize dangerous data schemas
    .replace(/(href|src)\s*=\s*("|')?\s*data:text\/html[^"'>\s]*/gi, '$1=$2#');
}

/**
 * Strip every styling channel from a model-authored fragment, leaving structure and text.
 *
 * The model gets structural freedom for content that fits none of the 20+ built-in mockup
 * types, and no say at all in how it looks — the same split already applied to
 * illustrations. This runs at render time, on every fragment, unconditionally. The prompt
 * also asks for it, but a prompt is a request; this is the enforcement.
 *
 * Returns null when nothing renderable survives, so the caller can fall back rather than
 * emit an empty or half-destroyed fragment.
 */
export function sanitizeCustomHtml(html: string): string | null {
  let out = sanitizeHookHtml(html);

  // <style> blocks first: their body is CSS, and stripping tags later would otherwise
  // leave the declarations behind as visible text.
  out = out.replace(/<\s*style\b[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  out = out.replace(/<\s*\/?\s*style\b[^>]*>/gi, "");

  // <link rel=stylesheet> and friends are another way to pull in styling.
  out = out.replace(/<\s*link\b[^>]*>/gi, "");

  out = out.replace(PRESENTATION_ATTRS, "");

  // Keep only whitelisted class tokens; drop the attribute entirely if none survive.
  out = out.replace(
    /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_full, dq?: string, sq?: string, bare?: string) => {
      const raw = dq ?? sq ?? bare ?? "";
      const kept = raw.split(/\s+/).filter((c) => WHITELIST.has(c));
      return kept.length ? ` class="${kept.join(" ")}"` : "";
    }
  );

  // Anything with no text and no structural element left is not worth rendering.
  const text = out.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  const hasContentTag = /<(p|div|ul|ol|li|table|tr|td|th|h[1-6]|span|section|figure|img|svg)\b/i.test(out);
  if (!text && !hasContentTag) return null;

  return out.trim() || null;
}
