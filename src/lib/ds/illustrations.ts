// Isomorphic half of the illustration system: slug vocabulary + normalization only.
// Safe to import from a client component — it carries no SVG payload (~4 KB total).
// The actual SVG bodies are server-only; see lib/ds/illustrations.server.ts.
import { ILLUSTRATION_SLUGS } from "../ds/illustrations.slugs.generated";
import manifest from "../ds/illustrations.manifest.json";

export { ILLUSTRATION_SLUGS };
export type IllustrationSlug = (typeof ILLUSTRATION_SLUGS)[number];

export const ILLUSTRATION_CATEGORIES = manifest as Record<string, string[]>;

export const FALLBACK_ILLUSTRATION: IllustrationSlug = "online-learning_tgmv";
const KNOWN = new Set<string>(ILLUSTRATION_SLUGS);

/** Lowercase, trim, and coerce to a known illustration slug (fallback: online-learning_tgmv). */
export function normalizeIllustration(raw: string): IllustrationSlug {
  const slug = (raw ?? "").trim().toLowerCase();
  return (KNOWN.has(slug) ? slug : FALLBACK_ILLUSTRATION) as IllustrationSlug;
}
