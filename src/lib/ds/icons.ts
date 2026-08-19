import { ICON_SLUGS, ICON_SVGS } from "../ds/icons.generated";

export { ICON_SLUGS };
export type IconSlug = (typeof ICON_SLUGS)[number];

const FALLBACK: IconSlug = "sparkles";
const KNOWN = new Set<string>(ICON_SLUGS);

/** Strip a `lucide:` prefix, lowercase/trim, and coerce to a known slug. */
export function normalizeIcon(raw: string): IconSlug {
  const slug = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^lucide:/, "");
  return (KNOWN.has(slug) ? slug : FALLBACK) as IconSlug;
}

/** Inline <svg> string for a slug, with size + color applied. Never empty. */
export function renderIcon(
  raw: string,
  opts: { size?: number; color?: string } = {}
): string {
  const { size = 24, color = "#EE4B1A" } = opts;
  const slug = normalizeIcon(raw);
  return ICON_SVGS[slug]
    .replace('width="24"', `width="${size}"`)
    .replace('height="24"', `height="${size}"`)
    .replace('stroke="currentColor"', `stroke="${color}"`);
}
