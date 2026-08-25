import { describe, it, expect, vi } from "vitest";
import { coverHookSchema, slidePlanSchema } from "@/lib/ds/schema";
import { repairSlidePlan } from "@/lib/ds/repair";
import { renderSlide } from "@/lib/ds/render-slide";
import { FALLBACK_ILLUSTRATION, ILLUSTRATION_SLUGS } from "@/lib/ds/illustrations";

/**
 * "Pakai illustration untuk cover" used to be unsatisfiable, and the failure looked like
 * a model problem rather than a schema one. A cover carries `hook` and has no `mockup`
 * field; no hook kind held an illustration. So the model either wrote `mockup`, which zod
 * stripped, or a hook kind that failed the union and was dropped — and the cover rendered
 * an empty anchor box. Asking again could not help: nothing it could return would work.
 */

const REAL_SLUG = ILLUSTRATION_SLUGS[0];

function cover(extra: Record<string, unknown> = {}) {
  return {
    role: "cover",
    eyebrow: "BATTLE LLM",
    headline: "GPT-4o vs DeepSeek R1",
    ...extra,
  };
}

function plan(slides: unknown[]) {
  return {
    title: "T",
    caption: "hook\n\n• a\n• b\n• c\n\ncta",
    hashtags: ["fyp", "backend", "coding", "developer", "vourdev"],
    slides,
  };
}

describe("cover hook: illustration", () => {
  it("is a legal cover anchor", () => {
    const res = coverHookSchema.safeParse({
      kind: "illustration",
      illustrationSlugs: [REAL_SLUG],
      caption: "analogi",
    });
    expect(res.success).toBe(true);
  });

  it("coerces an invented slug onto the fallback instead of rendering nothing", () => {
    const res = coverHookSchema.parse({
      kind: "illustration",
      illustrationSlugs: ["totally-made-up_zzzz"],
    });
    expect(res).toMatchObject({ illustrationSlugs: [FALLBACK_ILLUSTRATION] });
  });

  it("renders the illustration into the cover rather than an empty frame", () => {
    const slide = slidePlanSchema.parse(
      plan([cover({ hook: { kind: "illustration", illustrationSlugs: [REAL_SLUG] } })])
    ).slides[0];

    const html = renderSlide(slide, 0);

    expect(html).toContain("illustration-group");
    expect(html).toContain("illus-item");
    expect(html).toContain("<svg");
    expect(html).not.toContain("HOOK_INJECT");
  });

  it("uses the pair sizing for two slugs, like the point-slide mockup does", () => {
    const slide = slidePlanSchema.parse(
      plan([
        cover({
          hook: {
            kind: "illustration",
            illustrationSlugs: [ILLUSTRATION_SLUGS[1], ILLUSTRATION_SLUGS[2]],
          },
        }),
      ])
    ).slides[0];

    const html = renderSlide(slide, 0);
    expect(html).toContain("is-pair");
    expect((html.match(/illus-item/g) ?? []).length).toBe(2);
  });
});

describe("repair: what the model actually sends", () => {
  it("folds an illustration written as a cover `mockup` into the hook", () => {
    // The cover has no mockup field, so this is where the request silently vanished.
    const repaired = repairSlidePlan(
      plan([cover({ mockup: { type: "illustration", illustrationSlugs: [REAL_SLUG] } })])
    );

    expect(repaired.slides[0]).toMatchObject({
      hook: { kind: "illustration", illustrationSlugs: [REAL_SLUG] },
    });
    expect(repaired.slides[0]).not.toHaveProperty("mockup");
  });

  it("fills an illustration hook that named no slug, rather than dropping the request", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repaired = repairSlidePlan(
      plan([cover({ hook: { kind: "illustration", illustrationSlugs: [] } })])
    );

    expect(repaired.slides[0]).toMatchObject({
      hook: { kind: "illustration", illustrationSlugs: [FALLBACK_ILLUSTRATION] },
    });
    warn.mockRestore();
  });

  it("accepts the singular field name a model reaches for from the old shape", () => {
    const repaired = repairSlidePlan(
      plan([cover({ hook: { kind: "illustration", illustrationSlug: REAL_SLUG } })])
    );

    expect(repaired.slides[0]).toMatchObject({
      hook: { kind: "illustration", illustrationSlugs: [REAL_SLUG] },
    });
  });
});

describe("the blank box itself", () => {
  /**
   * The compact cover template draws the frame around HOOK_INJECT, so an anchor that
   * renders to nothing leaves a rectangle with a hole in it. That is what users reported.
   */
  it("falls back to the editorial cover when an anchor renders nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const slide = slidePlanSchema.parse(
      plan([cover({ hook: { kind: "custom", html: "<script>nope()</script>" } })])
    ).slides[0];

    const html = renderSlide(slide, 0);

    expect(html).not.toContain("HOOK_INJECT");
    expect(html).toContain("GPT-4o vs DeepSeek R1");
    // The editorial cover is a finished design; the compact one without an anchor is not.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[cover-hook]"));
    warn.mockRestore();
  });
});
