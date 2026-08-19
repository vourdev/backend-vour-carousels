import { describe, it, expect } from "vitest";
import type { SlidePlan } from "@/lib/ds/schema";
import { assembleCarousel } from "@/lib/ds/assemble";
import { samplePlan } from "@/lib/ds/sample";

const plan = {
  title: 'Title "quoted"',
  caption: "line1\nline2",
  hashtags: ["backend", "api"],
  slides: [
    { role: "cover", eyebrow: "BACKEND", headline: "Idempotency", accentWord: "Idempotency" },
    { role: "outro", headline: "Follow", cta: { strong: "Follow @vourdev" } },
  ],
} as const;

describe("assembleCarousel", () => {
  it("produces one document with a section per slide", () => {
    const html = assembleCarousel(plan as unknown as SlidePlan);
    expect(html).toContain("<!DOCTYPE html>");
    expect((html.match(/<section\s/g) ?? []).length).toBe(2);
    expect(html).toContain("<style>");
    expect(html).toContain("width: 1080px");
  });
  it("embeds a valid vourdev-meta JSON block", () => {
    const html = assembleCarousel(plan as unknown as SlidePlan);
    const m = html.match(/<script type="application\/json" id="vourdev-meta">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const meta = JSON.parse(m![1]);
    expect(meta.title).toBe('Title "quoted"');
    expect(meta.caption).toBe("line1\nline2");
    expect(meta.hashtags).toEqual(["backend", "api"]);
  });
  it("assembles without any Iconify CDN dependency", () => {
    const html = assembleCarousel(samplePlan);
    expect(html).not.toContain("iconify.design");
    expect(html).not.toContain("iconify-icon");
  });
});
