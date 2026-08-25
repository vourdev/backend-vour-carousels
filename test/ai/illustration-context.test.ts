import { describe, it, expect } from "vitest";
import {
  planSystem,
  reviseSystem,
  scopedSlideReviseSystem,
} from "@/lib/ai/prompts";
import { ILLUSTRATION_SLUGS } from "@/lib/ds/illustrations";

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
