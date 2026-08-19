import { describe, it, expect } from "vitest";
import { carouselCss } from "@/lib/ds/carousel-css";
import { brandMarkDataUri } from "@/lib/ds/brand";

describe("vendored design-system assets", () => {
  it("carouselCss carries the locked section dimensions", () => {
    expect(carouselCss).toContain("width: 1080px");
    expect(carouselCss).toContain("height: 1350px");
    expect(carouselCss).not.toContain("<style>");
  });
  it("brandMarkDataUri is a base64 data URI", () => {
    expect(brandMarkDataUri.startsWith("data:image/")).toBe(true);
    expect(brandMarkDataUri).toContain(";base64,");
    expect(brandMarkDataUri.length).toBeGreaterThan(1000);
  });
});
