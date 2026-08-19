/**
 * Gate-1 counterpart to revision-scope.ts: split the Markdown brief into its top-level
 * sections so a revision can rewrite one of them and leave the rest byte-identical.
 *
 * The brief has the same defect the plan had — `reviseBriefAction` regenerated the whole
 * document on every turn, so "perpendek headline slide 2" put every other slide's copy,
 * the caption and the hashtags back through the model. The prompt asked it not to change
 * them; nothing checked that it hadn't.
 *
 * The document's shape is fixed by briefSystem: a run of `# `-prefixed sections, in order
 * `# Carousel Content — <title>`, `# Slide 1 …` … `# Slide N …`, `# Caption`, `# Hashtag`.
 */

export type BriefSectionKind = "header" | "slide" | "caption" | "hashtag" | "other";

export interface BriefSection {
  kind: BriefSectionKind;
  /** 1-based slide number for `kind === "slide"`. */
  slideNumber?: number;
  heading: string;
  /** Heading line plus body, verbatim, including the trailing blank lines. */
  text: string;
}

const RE_H1 = /^# .*$/gm;
const RE_SLIDE_HEADING = /^#\s*Slide\s+(\d{1,2})\b/i;
const RE_CAPTION_HEADING = /^#\s*Caption\b/i;
const RE_HASHTAG_HEADING = /^#\s*Hashtags?\b/i;
const RE_HEADER_HEADING = /^#\s*Carousel\s+Content\b/i;

function classify(heading: string): { kind: BriefSectionKind; slideNumber?: number } {
  const slide = RE_SLIDE_HEADING.exec(heading);
  if (slide) return { kind: "slide", slideNumber: Number(slide[1]) };
  if (RE_CAPTION_HEADING.test(heading)) return { kind: "caption" };
  if (RE_HASHTAG_HEADING.test(heading)) return { kind: "hashtag" };
  if (RE_HEADER_HEADING.test(heading)) return { kind: "header" };
  return { kind: "other" };
}

/**
 * Split on top-level headings. Any preamble before the first `# ` is kept as an
 * "other" section so `splitBrief` → `joinBrief` is lossless for any input.
 */
export function splitBrief(brief: string): BriefSection[] {
  const starts: number[] = [];
  RE_H1.lastIndex = 0;
  for (let m = RE_H1.exec(brief); m !== null; m = RE_H1.exec(brief)) starts.push(m.index);

  if (starts.length === 0) {
    return [{ kind: "other", heading: "", text: brief }];
  }

  const sections: BriefSection[] = [];
  if (starts[0] > 0) {
    sections.push({ kind: "other", heading: "", text: brief.slice(0, starts[0]) });
  }
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : brief.length;
    const text = brief.slice(from, to);
    const heading = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n")).trim();
    sections.push({ ...classify(heading), heading, text });
  }
  return sections;
}

export function joinBrief(sections: BriefSection[]): string {
  return sections.map((s) => s.text).join("");
}

/** Indices into `splitBrief`'s output that a scope targets. */
export function briefTargets(
  sections: BriefSection[],
  scope: { slides: number[]; globals: string[] }
): number[] {
  const wantSlides = new Set(scope.slides.map((i) => i + 1));
  const out: number[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.kind === "slide" && s.slideNumber !== undefined && wantSlides.has(s.slideNumber)) out.push(i);
    else if (s.kind === "caption" && scope.globals.includes("caption")) out.push(i);
    else if (s.kind === "hashtag" && scope.globals.includes("hashtags")) out.push(i);
    else if (s.kind === "header" && scope.globals.includes("title")) out.push(i);
  }
  return out;
}

/**
 * Swap in the rewritten sections by heading match, keeping every other byte.
 *
 * Matching on the heading rather than on order means a model that returns the sections
 * in a different order, or repeats the full document, still lands correctly — and a
 * section it invented has no heading to match, so it is dropped rather than appended.
 */
export function mergeBriefSections(
  sections: BriefSection[],
  targetIndices: number[],
  rewritten: string
): { brief: string; applied: number[]; missing: string[] } {
  const incoming = splitBrief(rewritten);
  const byHeading = new Map<string, BriefSection>();
  for (const s of incoming) {
    if (s.heading) byHeading.set(normalizeHeading(s.heading), s);
  }

  const applied: number[] = [];
  const missing: string[] = [];
  const next = sections.slice();

  for (const idx of targetIndices) {
    const target = sections[idx];
    const match = byHeading.get(normalizeHeading(target.heading));
    if (!match) {
      missing.push(target.heading);
      continue;
    }
    // Preserve the original section's trailing whitespace so the document's spacing
    // does not drift a newline at a time across a long revision session.
    next[idx] = { ...target, text: retrailing(match.text, target.text) };
    applied.push(idx);
  }

  return { brief: joinBrief(next), applied, missing };
}

/** Headings carry the slide's title, which a revision is allowed to change. Match on the
 *  stable part: "# Slide 4" / "# Caption" / "# Carousel Content". */
function normalizeHeading(heading: string): string {
  const slide = RE_SLIDE_HEADING.exec(heading);
  if (slide) return `slide ${slide[1]}`;
  if (RE_CAPTION_HEADING.test(heading)) return "caption";
  if (RE_HASHTAG_HEADING.test(heading)) return "hashtag";
  if (RE_HEADER_HEADING.test(heading)) return "header";
  return heading.trim().toLowerCase();
}

function retrailing(incoming: string, original: string): string {
  const trail = /\s*$/.exec(original)?.[0] ?? "\n\n";
  return incoming.replace(/\s*$/, trail);
}

/** Sections outside `targetIndices` that differ between two briefs. */
export function briefScopeViolations(
  before: BriefSection[],
  afterBrief: string,
  targetIndices: number[]
): string[] {
  const after = splitBrief(afterBrief);
  const inScope = new Set(targetIndices);

  if (before.length !== after.length) {
    return [`section count: ${before.length} -> ${after.length}`];
  }
  const out: string[] = [];
  for (let i = 0; i < before.length; i++) {
    if (inScope.has(i)) continue;
    if (before[i].text !== after[i].text) out.push(before[i].heading || `section ${i + 1}`);
  }
  return out;
}
