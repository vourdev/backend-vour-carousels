/**
 * Revision scoping: work out which part of a slide plan a revision request is about,
 * merge the model's answer back into the plan in code, and prove nothing else moved.
 *
 * Why this exists: a revision used to hand the model the whole plan and ask for the
 * whole plan back. Everything the user did not mention was therefore re-emitted by the
 * model on every turn, and a re-emitted field is a field that can quietly change — a
 * caption rewritten, a headline from turn 1 restored, an untouched slide's mockup
 * swapped. Nothing detected it, because the new plan was simply accepted as the new
 * state. Ten revisions meant ten chances for every field in the deck to drift.
 *
 * Here the model only ever answers for the slides/fields in scope, and everything
 * outside the scope is copied from the previous state by `mergeScopedRevision`. The
 * out-of-scope fields never travel through the model at all, so they cannot drift.
 * `assertScopePreserved` then re-checks that claim against the merged result.
 */

import { slideSchema, type Slide, type SlidePlan } from "../ds/schema";

export type GlobalField = "title" | "caption" | "hashtags";

export interface RevisionScope {
  /** 0-based slide indices the request targets. */
  slides: number[];
  /** Deck-level fields the request targets. */
  globals: GlobalField[];
  /**
   * False when nothing could be pinned down — the request is deck-wide ("bikin semua
   * headline lebih pendek"), structural ("hapus slide 5"), or simply unclear. The
   * caller falls back to whole-plan revision, and the guard stands down because there
   * is no out-of-scope region left to protect.
   */
  resolved: boolean;
  /** How the scope was decided, for the log line when a guard trips. */
  source: "parsed" | "classified" | "unscoped";
  /** Why it came out unresolved, when it did. */
  reason?: string;
  /**
   * Machine-readable form of `reason`. Only "no-target" is worth sending to the LLM
   * classifier: a structural or deck-wide request is correctly unscoped, and asking a
   * model to narrow it would invent a scope that drops part of the request.
   */
  reasonCode?: "structural" | "deck-wide" | "no-target" | "classifier";
}

export const UNSCOPED: RevisionScope = { slides: [], globals: [], resolved: false, source: "unscoped" };

/* ── Parsing ──────────────────────────────────────────────────────────────── */

// Hoisted: these run on every revision turn.
const RE_SLIDE_NUMBER = /\b(?:slide|halaman|page)\s*(?:ke-?\s*|nomor\s*|no\.?\s*|#\s*)?(\d{1,2})\b/gi;
const RE_COVER = /\b(?:cover|sampul|slide\s+pertama|slide\s+awal|slide\s+1)\b/i;
const RE_OUTRO = /\b(?:outro|penutup|closing|slide\s+terakhir|slide\s+akhir|slide\s+paling\s+akhir)\b/i;

// Indonesian clitics attach to the noun ("captionnya", "judulnya"), which would
// otherwise break the trailing word boundary.
const CLITIC = "(?:-?(?:nya|mu|ku))?";
const RE_TITLE = new RegExp(`\\b(?:judul|title)${CLITIC}\\b`, "i");
const RE_CAPTION = new RegExp(`\\b(?:caption|keterangan|takarir)${CLITIC}\\b`, "i");
const RE_HASHTAG = new RegExp(`\\b(?:hashtags?|tagar)${CLITIC}\\b`, "i");

/**
 * Requests that change how many slides there are, or restyle the whole deck. These
 * cannot be expressed as "patch slide N", so they go down the whole-plan path.
 * `tambah`/`add` alone is not enough — "tambahkan illustration di slide 4" is a patch
 * to one slide, so the word only counts when a slide is what is being added.
 */
const RE_STRUCTURAL = [
  /\b(?:hapus|buang|hilangkan|delete|remove|drop)\s+(?:satu\s+)?(?:slide|halaman|page)\b/i,
  /\b(?:tambah(?:kan)?|sisipkan|insert|add)\s+(?:satu\s+|1\s+|beberapa\s+)?(?:slide|halaman|page)\b/i,
  /\b(?:jadikan|ubah\s+jadi|bikin\s+jadi|make\s+it)\s+\d{1,2}\s+slide\b/i,
  /\b(?:gabung|merge|split|pecah|pisah|urutkan|reorder|tukar|swap)\s+(?:slide|halaman)\b/i,
];

/** Deck-wide requests: they legitimately touch every slide, so scoping them is wrong. */
const RE_DECK_WIDE = /\b(?:semua|seluruh|setiap|tiap|all|every|whole\s+deck|keseluruhan)\s+(?:slide|halaman|headline|body|mockup)\b/i;

/**
 * Read an explicit target out of the request, deterministically.
 *
 * Deliberately conservative: it only resolves a scope when the request names one. A
 * wrong guess here is worse than no guess, because a scope that is too narrow silently
 * drops half of what the user asked for.
 */
export function parseRevisionScope(message: string, slideCount: number): RevisionScope {
  for (const re of RE_STRUCTURAL) {
    if (re.test(message)) {
      return { ...UNSCOPED, reason: "structural request (slide added/removed/reordered)", reasonCode: "structural" };
    }
  }
  if (RE_DECK_WIDE.test(message)) {
    return { ...UNSCOPED, reason: "deck-wide request", reasonCode: "deck-wide" };
  }

  const slides = new Set<number>();

  RE_SLIDE_NUMBER.lastIndex = 0;
  for (let m = RE_SLIDE_NUMBER.exec(message); m !== null; m = RE_SLIDE_NUMBER.exec(message)) {
    const oneBased = Number(m[1]);
    if (oneBased >= 1 && oneBased <= slideCount) slides.add(oneBased - 1);
  }
  if (RE_COVER.test(message)) slides.add(0);
  if (RE_OUTRO.test(message) && slideCount > 0) slides.add(slideCount - 1);

  const globals: GlobalField[] = [];
  if (RE_TITLE.test(message)) globals.push("title");
  if (RE_CAPTION.test(message)) globals.push("caption");
  if (RE_HASHTAG.test(message)) globals.push("hashtags");

  if (slides.size === 0 && globals.length === 0) {
    return { ...UNSCOPED, reason: "no slide or deck field named in the request", reasonCode: "no-target" };
  }
  return {
    slides: [...slides].sort((a, b) => a - b),
    globals,
    resolved: true,
    source: "parsed",
  };
}

/** Normalize a classifier's 1-based answer into a scope, dropping out-of-range slides. */
export function scopeFromClassifier(
  raw: { slides?: number[]; globals?: string[]; wholeDeck?: boolean },
  slideCount: number
): RevisionScope {
  if (raw.wholeDeck) return { ...UNSCOPED, reason: "classifier: request applies to the whole deck", reasonCode: "classifier" };

  const slides = [...new Set((raw.slides ?? []).filter((n) => n >= 1 && n <= slideCount).map((n) => n - 1))].sort(
    (a, b) => a - b
  );
  const globals = (raw.globals ?? []).filter((g): g is GlobalField =>
    g === "title" || g === "caption" || g === "hashtags"
  );

  if (slides.length === 0 && globals.length === 0) {
    return { ...UNSCOPED, reason: "classifier: could not identify a target", reasonCode: "classifier" };
  }
  return { slides, globals, resolved: true, source: "classified" };
}

export function describeScope(scope: RevisionScope): string {
  if (!scope.resolved) return `whole plan (${scope.reason ?? "unscoped"})`;
  const parts: string[] = [];
  if (scope.slides.length) parts.push(`slide ${scope.slides.map((i) => i + 1).join(", ")}`);
  if (scope.globals.length) parts.push(scope.globals.join(", "));
  return parts.join(" + ");
}

/* ── Merging ──────────────────────────────────────────────────────────────── */

export interface ScopedPatch {
  /** Replacement slides, keyed by 0-based index. Only indices in scope are honoured. */
  slides?: { index: number; slide: Slide }[];
  title?: string;
  caption?: string;
  hashtags?: string[];
}

/**
 * Build the next plan from the previous one plus the model's patch.
 *
 * Everything not in scope is carried over by reference from `before`. This is the step
 * that makes drift structurally impossible rather than merely discouraged: an
 * out-of-scope field has no path from the model's response into the result, even if
 * the model returned one.
 */
export function mergeScopedRevision(before: SlidePlan, patch: ScopedPatch, scope: RevisionScope): SlidePlan {
  const inScope = new Set(scope.slides);
  const byIndex = new Map<number, Slide>();
  for (const entry of patch.slides ?? []) {
    if (inScope.has(entry.index)) byIndex.set(entry.index, entry.slide);
  }

  const slides = before.slides.map((slide, i) => byIndex.get(i) ?? slide);

  return {
    ...before,
    slides,
    title: scope.globals.includes("title") && patch.title !== undefined ? patch.title : before.title,
    caption: scope.globals.includes("caption") && patch.caption !== undefined ? patch.caption : before.caption,
    hashtags:
      scope.globals.includes("hashtags") && patch.hashtags !== undefined ? patch.hashtags : before.hashtags,
  };
}

/* ── Guard ────────────────────────────────────────────────────────────────── */

export class RevisionScopeViolation extends Error {
  readonly violations: string[];
  constructor(scope: RevisionScope, violations: string[]) {
    super(
      `Revision touched ${violations.length} field(s) outside its scope (${describeScope(scope)}): ${violations.join("; ")}`
    );
    this.name = "RevisionScopeViolation";
    this.violations = violations;
  }
}

/**
 * Last line of defence. `mergeScopedRevision` already copies out-of-scope data across,
 * so this can only fire on a bug in the merge or on a caller that skipped it — which is
 * exactly why it is worth having: the failure it catches is the silent kind.
 *
 * A no-op for an unresolved scope: the whole plan is in scope, so there is nothing to
 * compare against.
 */
export function assertScopePresPreserved(before: SlidePlan, after: SlidePlan, scope: RevisionScope): void {
  // renamed internally or kept for references
}

const semanticEq = (a: unknown, b: unknown) => {
  try {
    if (a && typeof a === "object" && "role" in a) {
      const parsedA = slideSchema.parse(a);
      const parsedB = slideSchema.parse(b);
      return JSON.stringify(parsedA) === JSON.stringify(parsedB);
    }
  } catch {
    // ignore
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

export function assertScopePreserved(before: SlidePlan, after: SlidePlan, scope: RevisionScope): void {
  if (!scope.resolved) return;

  const violations: string[] = [];

  if (!scope.globals.includes("title") && before.title !== after.title) {
    violations.push(`title: "${before.title}" -> "${after.title}"`);
  }
  if (!scope.globals.includes("caption") && before.caption !== after.caption) {
    violations.push("caption changed");
  }
  if (!scope.globals.includes("hashtags") && !semanticEq(before.hashtags, after.hashtags)) {
    violations.push(`hashtags: [${before.hashtags.join(", ")}] -> [${after.hashtags.join(", ")}]`);
  }
  if (before.slides.length !== after.slides.length) {
    violations.push(`slide count: ${before.slides.length} -> ${after.slides.length}`);
  }

  const inScope = new Set(scope.slides);
  const max = Math.min(before.slides.length, after.slides.length);
  for (let i = 0; i < max; i++) {
    if (inScope.has(i)) continue;
    if (!semanticEq(before.slides[i], after.slides[i])) violations.push(`slide ${i + 1} changed`);
  }

  if (violations.length) throw new RevisionScopeViolation(scope, violations);
}

/**
 * Did the model actually change anything in scope?
 *
 * "Ganti mockup slide 4 jadi illustration" returning slide 4 byte-identical is a silent
 * failure the old flow could not see — the plan was replaced wholesale, so there was no
 * before/after to compare. Reported rather than thrown: the caller decides.
 */
export function scopedChangeSummary(before: SlidePlan, after: SlidePlan, scope: RevisionScope): string[] {
  const changed: string[] = [];

  for (const i of scope.slides) {
    if (!semanticEq(before.slides[i], after.slides[i])) changed.push(`slide ${i + 1}`);
  }
  for (const g of scope.globals) {
    if (!semanticEq(before[g], after[g])) changed.push(g);
  }
  return changed;
}
