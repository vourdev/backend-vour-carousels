import type { Slide, SlidePlan } from "../ds/schema";

/**
 * Describe what a revision actually changed, in one short line.
 *
 * This is the `outcome` stored alongside each remembered turn, and it is derived
 * from the before/after plans rather than asked of the model: a self-reported
 * summary can claim a change the model never made, which would poison the very
 * memory that later turns rely on.
 */

/** Human-facing label for a slide position, e.g. "slide 3 (point)". */
function label(slide: Slide | undefined, index: number): string {
  return slide ? `slide ${index + 1} (${slide.role})` : `slide ${index + 1}`;
}

/** Fields worth naming in a summary; anything else is reported as "mockup"/"hook". */
const TRACKED_FIELDS = [
  "eyebrow",
  "headline",
  "accentWord",
  "lede",
  "body",
  "counter",
  "stamp",
  "ghostNumeral",
  "surface",
  "cta",
] as const;

function changedFields(before: Slide, after: Slide): string[] {
  const out: string[] = [];
  for (const key of TRACKED_FIELDS) {
    const a = (before as Record<string, unknown>)[key];
    const b = (after as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(key);
  }
  const beforeMockup = (before as Record<string, unknown>).mockup;
  const afterMockup = (after as Record<string, unknown>).mockup;
  if (JSON.stringify(beforeMockup) !== JSON.stringify(afterMockup)) {
    const at = (afterMockup as { type?: string } | undefined)?.type;
    const bt = (beforeMockup as { type?: string } | undefined)?.type;
    out.push(at && bt && at !== bt ? `mockup ${bt}->${at}` : "mockup");
  }
  const beforeHook = (before as Record<string, unknown>).hook;
  const afterHook = (after as Record<string, unknown>).hook;
  if (JSON.stringify(beforeHook) !== JSON.stringify(afterHook)) {
    const ak = (afterHook as { kind?: string } | undefined)?.kind;
    out.push(ak ? `hook->${ak}` : "hook removed");
  }
  return out;
}

export function summarizePlanDiff(before: SlidePlan, after: SlidePlan): string {
  const notes: string[] = [];

  if (before.title !== after.title) notes.push("title");
  if (before.caption !== after.caption) notes.push("caption");
  if (JSON.stringify(before.hashtags) !== JSON.stringify(after.hashtags)) notes.push("hashtags");

  const max = Math.max(before.slides.length, after.slides.length);
  for (let i = 0; i < max; i++) {
    const b = before.slides[i];
    const a = after.slides[i];
    if (b && !a) {
      notes.push(`removed ${label(b, i)}`);
      continue;
    }
    if (!b && a) {
      notes.push(`added ${label(a, i)}`);
      continue;
    }
    if (!b || !a) continue;
    if (b.role !== a.role) {
      notes.push(`${label(b, i)} became ${a.role}`);
      continue;
    }
    const fields = changedFields(b, a);
    if (fields.length) notes.push(`${label(a, i)}: ${fields.join(", ")}`);
  }

  if (!notes.length) return "no structural change detected";
  return notes.join("; ");
}
