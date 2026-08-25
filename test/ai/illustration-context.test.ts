import { describe, it, expect } from "vitest";
import {
  planSystem,
  reviseSystem,
  scopedSlideReviseSystem,
} from "@/lib/ai/prompts";
import { ILLUSTRATION_SLUGS } from "@/lib/ds/illustrations";
import { MOCKUP_TYPES } from "@/lib/ds/schema";

/**
 * A model cannot pick a slug it has never been shown.
 *
 * Generation always carried the catalogue, and the scoped revision paths did too — but
 * `reviseSystem`, the path a revision falls back to whenever the scope classifier cannot
 * narrow the request, carried none of the 156. It was asked to change a mockup to
 * "illustration" while holding no list of legal values.
 *
 * The narrowing done for scoped revisions applies to the OUTPUT — return only the fields
 * in scope, so a one-slide edit cannot rewrite the caption. It was never meant to narrow
 * the reference material the model reads, and this locks that distinction in place.
 */
const PATHS: [string, string][] = [
  ["planSystem (generation)", planSystem],
  ["reviseSystem (whole-plan fallback)", reviseSystem],
  ["scopedSlideReviseSystem (scoped)", scopedSlideReviseSystem],
];

describe("illustration catalogue reaches every path that can set a mockup", () => {
  it.each(PATHS)("%s lists every slug", (_name, prompt) => {
    const missing = ILLUSTRATION_SLUGS.filter((s) => !prompt.includes(s));
    expect(missing).toEqual([]);
  });

  it.each(PATHS)("%s names the categories block the rules refer to", (_name, prompt) => {
    expect(prompt).toContain("ILLUSTRATION_CATEGORIES");
    expect(prompt).toContain("Available categories");
  });

  /**
   * The cover is the case that prompted all of this: it has no `mockup` field, so an
   * illustration there is a hook and nothing else will do.
   */
  it.each([
    ["planSystem", planSystem],
    ["reviseSystem", reviseSystem],
    ["scopedSlideReviseSystem", scopedSlideReviseSystem],
  ])("%s tells the model an illustration cover is a hook", (_name, prompt) => {
    expect(prompt).toContain('kind: "illustration"');
  });
});

/**
 * A revision can change a mockup to any of the thirty-two types, so it has to be shown
 * what those are. It was not: `scopedSlideReviseSystem` — the path every chat revision
 * takes — named ONE type out of thirty-two, and `reviseSystem` named two. Generation
 * listed all of them, which is exactly why the same request behaved differently there.
 */
describe("every path that can set a mockup can see all of them", () => {
  /**
   * Two shapes count as "shown". planSystem carries the long numbered catalogue, which
   * lists every field of every type and is what generation needs. The revision paths
   * carry MOCKUP_MENU, the short form: what exists and when to reach for it. Either way
   * the type name is in front of the model, which is the thing that was missing.
   */
  const shown = (prompt: string, type: string) =>
    prompt.includes(`- ${type} —`) || prompt.includes(`type: "${type}"`);

  it.each(PATHS)("%s shows every type in the schema union", (_name, prompt) => {
    expect(MOCKUP_TYPES.filter((t) => !shown(prompt, t))).toEqual([]);
  });

  /** The revision paths specifically need the menu — they had one type between them. */
  it.each(PATHS.slice(1))("%s carries the compact menu", (_name, prompt) => {
    expect(MOCKUP_TYPES.filter((t) => !prompt.includes(`- ${t} —`))).toEqual([]);
  });

  it("the menu is derived from the schema, so a new type cannot be forgotten", () => {
    // A type in the union but missing from MOCKUP_PURPOSE renders this marker instead.
    for (const [, prompt] of PATHS) expect(prompt).not.toContain("NO DESCRIPTION");
  });
});

/**
 * Custom is the one mockup whose size the model controls, and the slot only clamps width.
 * A block taller than its slot pushes the note off the 1350px canvas silently.
 */
describe("custom mockup sizing contract", () => {
  it.each(PATHS)("%s states the real usable width", (_name, prompt) => {
    expect(prompt).toContain("920px");
    expect(prompt).toContain("1080x1350");
  });

  it.each(PATHS)("%s warns that height is the unclamped axis", (_name, prompt) => {
    expect(prompt).toContain("HEIGHT DOES NOT");
  });

  it.each(PATHS)("%s says fixed dimensions are stripped, not honoured", (_name, prompt) => {
    expect(prompt).toMatch(/STRIPPED/);
  });
});
