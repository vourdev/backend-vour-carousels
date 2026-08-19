import { describe, it, expect } from "vitest";
import { slidePlanSchema } from "@/lib/ds/schema";
import { samplePlan } from "@/lib/ds/sample";
import { assembleCarousel } from "@/lib/ds/assemble";

describe("samplePlan", () => {
  it("is a valid slidePlan", () => {
    expect(() => slidePlanSchema.parse(samplePlan)).not.toThrow();
  });
  it("assembles to a full document with 8 sections", () => {
    const html = assembleCarousel(samplePlan);
    expect((html.match(/<section\s/g) ?? []).length).toBe(8);
  });
});

describe("samplePlan variety", () => {
  it("exercises at least 4 distinct mockup types", () => {
    const types = new Set(
      samplePlan.slides
        .filter((s) => s.role === "point")
        .map((s) => (s as { mockup?: { type: string } }).mockup?.type)
        .filter(Boolean)
    );
    expect(types.size).toBeGreaterThanOrEqual(4);
  });
  it("uses the new diagram mockups (flow/hub/concept/checklist)", () => {
    const types = new Set(
      samplePlan.slides
        .filter((s) => s.role === "point")
        .map((s) => (s as { mockup?: { type: string } }).mockup?.type)
    );
    for (const t of ["flow", "hub", "concept", "checklist"]) {
      expect(types.has(t), t).toBe(true);
    }
  });
  it("has a text-only cover (no hook)", () => {
    const cover = samplePlan.slides.find((s) => s.role === "cover");
    expect(cover && "hook" in cover ? cover.hook : undefined).toBeUndefined();
  });
  it("assembles to inline-svg icons, no iconify", () => {
    const html = assembleCarousel(samplePlan);
    expect(html).toContain("<svg");
    expect(html).not.toContain("iconify-icon");
  });
});
