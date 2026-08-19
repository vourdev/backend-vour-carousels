import { describe, it, expect } from "vitest";
import { normalizeIcon, renderIcon, ICON_SLUGS } from "@/lib/ds/icons";
import { ICON_SVGS } from "@/lib/ds/icons.generated";
import { VOUR_ORANGE } from "@/lib/ds/tokens";

describe("normalizeIcon", () => {
  it("strips a lucide: prefix", () => {
    expect(normalizeIcon("lucide:repeat")).toBe("repeat");
  });
  it("accepts a bare valid slug", () => {
    expect(normalizeIcon("shield-check")).toBe("shield-check");
  });
  it("lowercases and trims", () => {
    expect(normalizeIcon("  Lucide:Terminal ")).toBe("terminal");
  });
  it("maps unknown / placeholder input to the sparkles fallback", () => {
    expect(normalizeIcon("lucide:slug")).toBe("sparkles");
    expect(normalizeIcon("lucide:<icon-slug>")).toBe("sparkles");
    expect(normalizeIcon("totally-made-up")).toBe("sparkles");
    expect(normalizeIcon("")).toBe("sparkles");
  });
});

describe("renderIcon", () => {
  it("returns an inline svg for a valid slug", () => {
    const svg = renderIcon("lucide:terminal");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
  it("applies size and color", () => {
    const svg = renderIcon("terminal", { size: 40, color: "#123456" });
    expect(svg).toContain('width="40"');
    expect(svg).toContain('height="40"');
    expect(svg).toContain('stroke="#123456"');
    expect(svg).not.toContain('stroke="currentColor"');
  });
  it("defaults to the light-surface brand accent", () => {
    expect(renderIcon("terminal")).toContain(`stroke="${VOUR_ORANGE}"`);
  });
  it("falls back to sparkles for unknown, never empty", () => {
    const svg = renderIcon("nope");
    expect(svg).toContain("<svg");
    expect(svg).toBe(renderIcon("sparkles"));
  });
});

describe("allowlist integrity", () => {
  it("every slug has a non-empty svg in the generated map", () => {
    for (const slug of ICON_SLUGS) {
      expect(ICON_SVGS[slug], slug).toBeTruthy();
      expect(ICON_SVGS[slug]).toContain("<svg");
    }
  });
  it("includes the sparkles fallback", () => {
    expect(ICON_SLUGS).toContain("sparkles");
  });
});
