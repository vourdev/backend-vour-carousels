/**
 * A small RSS/Atom reader.
 *
 * No parser dependency: the repo ships no XML library, and a feed is a shallow, predictable
 * document — `<item>`/`<entry>` blocks with four fields worth reading. What a real parser
 * would buy here is robustness against XML we never accept anyway.
 *
 * Every field is extracted by name and then flattened to plain text. Nothing reads
 * `<media:content>`, `<enclosure>`, `<image>` or an `<img>` inside a description, so no
 * image URL from a news article can reach the rest of the system even by accident — see the
 * note in ./feeds.ts.
 */

export interface RawFeedItem {
  title: string;
  link: string;
  /** Plain-text summary, tags stripped. Empty when the feed has none worth reading. */
  summary: string;
  /** Epoch ms, or null when the feed gave no readable date. */
  publishedAt: number | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
  "#8217": "’",
  "#8216": "‘",
  "#8220": "“",
  "#8221": "”",
  "#8212": "—",
  "#8211": "–",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    const direct = ENTITIES[name] ?? ENTITIES[name.toLowerCase()];
    if (direct) return direct;
    if (/^#x/i.test(name)) {
      const code = parseInt(name.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (/^#/.test(name)) {
      const code = parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

/**
 * CDATA out, entities decoded, tags out, whitespace collapsed — in that order.
 *
 * Decoding BEFORE stripping is the part that matters. Atom summaries are commonly
 * `type="html"` with the markup entity-escaped, so `&lt;b&gt;on by default&lt;/b&gt;` decodes
 * to real tags; stripping first left those tags in the output as literal text, and the
 * "summary" handed to the model read `Compatibility is now <b>on by default</b>.`
 */
export function toPlainText(raw: string): string {
  const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(withoutCdata)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    // A tag becomes a space, so "…default</b>." collapses to "…default ." without this.
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function firstTag(block: string, names: string[]): string | null {
  for (const name of names) {
    // Namespaced twins (`dc:date` vs `date`) are matched by the caller listing both.
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const m = block.match(re);
    if (m && m[1].trim()) return m[1];
  }
  return null;
}

/** Atom puts the URL in an attribute; RSS puts it in the body. Try both, in that order. */
function extractLink(block: string): string {
  const alternate = block.match(
    /<link\b[^>]*\brel=["']?alternate["']?[^>]*\bhref=["']([^"']+)["'][^>]*>/i
  );
  if (alternate) return decodeEntities(alternate[1].trim());

  const anyHref = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (anyHref) return decodeEntities(anyHref[1].trim());

  const body = firstTag(block, ["link", "guid", "id"]);
  if (body) {
    const text = toPlainText(body);
    if (/^https?:\/\//i.test(text)) return text;
  }
  return "";
}

function extractDate(block: string): number | null {
  const raw = firstTag(block, ["pubDate", "published", "updated", "dc:date", "date"]);
  if (!raw) return null;
  const parsed = Date.parse(toPlainText(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFeed(xml: string, opts?: { maxItems?: number }): RawFeedItem[] {
  const max = opts?.maxItems ?? 40;
  const blocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];

  const items: RawFeedItem[] = [];
  for (const block of blocks.slice(0, max)) {
    const titleRaw = firstTag(block, ["title"]);
    if (!titleRaw) continue;
    const title = toPlainText(titleRaw);
    if (title.length < 8) continue;

    const link = extractLink(block);
    // No URL means the item cannot be cited later, and an uncitable "source" is worse than
    // no source — it would sit in `source_urls` looking like provenance.
    if (!/^https?:\/\//i.test(link)) continue;

    const summaryRaw = firstTag(block, ["description", "summary", "content:encoded", "content"]);
    const summary = summaryRaw ? toPlainText(summaryRaw).slice(0, 600) : "";

    items.push({ title, link, summary, publishedAt: extractDate(block) });
  }
  return items;
}
