import { describe, it, expect } from "vitest";
import { mockupSchema } from "@/lib/ds/schema";
import { repairSlidePlan } from "@/lib/ds/repair";
import { renderSlide } from "@/lib/ds/render-slide";
import { assembleCarousel } from "@/lib/ds/assemble";

describe("Screenshot Evidence System", () => {
  it("parses valid mockupScreenshot schema with pending evidenceStatus", () => {
    const raw = {
      type: "screenshot",
      screenshotBrief: {
        source: "AWS CloudWatch Metrics",
        mustShow: "504 Gateway Timeout spike at 14:02",
        mustHide: "Account ID and API Key",
        cropRatio: "4:5",
      },
      evidenceStatus: "pending",
    };

    const parsed = mockupSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("screenshot");
      if (parsed.data.type === "screenshot") {
        expect(parsed.data.evidenceStatus).toBe("pending");
        expect(parsed.data.screenshotBrief?.source).toBe("AWS CloudWatch Metrics");
      }
    }
  });

  it("repairSlidePlan retains screenshot mockup and pending status", () => {
    const plan = {
      title: "AWS Outage Case Study",
      caption: "504 Incident Analysis",
      hashtags: ["fyp", "aws", "devops", "cloud", "vourdev"],
      slides: [
        {
          role: "point",
          counter: "02 / 05",
          eyebrow: "INCIDENT PROOF",
          headline: "Spike 504 Timeout saat High Traffic",
          accentWord: "High Traffic",
          body: "CloudWatch menunjukkan 100% request dropped.",
          mockup: {
            type: "screenshot",
            screenshotBrief: {
              source: "AWS CloudWatch Metrics",
              mustShow: "504 spike",
              mustHide: "Secret Key",
              cropRatio: "4:5",
            },
            evidenceStatus: "pending",
          },
        },
      ],
    };

    const repaired = repairSlidePlan(plan);
    const slide = repaired.slides[0];
    expect(slide.role).toBe("point");
    if (slide.role === "point") {
      expect(slide.mockup?.type).toBe("screenshot");
      if (slide.mockup?.type === "screenshot") {
        expect(slide.mockup.evidenceStatus).toBe("pending");
      }
    }
  });

  it("renders pending placeholder with warning badge when evidenceStatus is pending", () => {
    const slide = {
      role: "point" as const,
      counter: "02 / 05",
      eyebrow: "EVIDENCE",
      headline: "Bukti 504 Gateway Timeout",
      accentWord: "Gateway Timeout",
      body: "Lihat grafik CloudWatch berikut.",
      mockup: {
        type: "screenshot" as const,
        screenshotBrief: {
          source: "Chrome DevTools Network tab",
          mustShow: "Status 504",
          mustHide: "Bearer token",
          cropRatio: "4:5",
        },
        evidenceStatus: "pending" as const,
      },
    };

    const html = renderSlide(slide, 1);
    expect(html).toContain("diag-screenshot-placeholder");
    expect(html).toContain("BUTUH SCREENSHOT ASLI");
    expect(html).toContain("Chrome DevTools Network tab");
    expect(html).toContain("Status 504");
  });

  it("renders captured screenshot image when dataUrl is present", () => {
    const fakeDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";
    const slide = {
      role: "point" as const,
      counter: "02 / 05",
      eyebrow: "EVIDENCE",
      headline: "Bukti 504 Gateway Timeout",
      accentWord: "Gateway Timeout",
      body: "Lihat grafik CloudWatch berikut.",
      mockup: {
        type: "screenshot" as const,
        screenshotBrief: {
          source: "Chrome DevTools Network tab",
          mustShow: "Status 504",
          mustHide: "Bearer token",
          cropRatio: "4:5",
        },
        screenshotImage: {
          dataUrl: fakeDataUrl,
          uploadedAt: "2026-08-09T18:00:00Z",
        },
        evidenceStatus: "captured" as const,
      },
    };

    const html = renderSlide(slide, 1);
    expect(html).toContain("diag-screenshot");
    expect(html).toContain(fakeDataUrl);
    expect(html).not.toContain("BUTUH SCREENSHOT ASLI");
  });

  it("renders text reference mode when evidenceStatus is fallback_used", () => {
    const slide = {
      role: "point" as const,
      counter: "02 / 05",
      eyebrow: "EVIDENCE",
      headline: "Bukti 504 Gateway Timeout",
      accentWord: "Gateway Timeout",
      body: "Lihat grafik CloudWatch berikut.",
      mockup: {
        type: "screenshot" as const,
        screenshotBrief: {
          source: "AWS CloudWatch Metrics",
          mustShow: "504 spike",
          mustHide: "Secret Key",
          cropRatio: "4:5",
        },
        evidenceStatus: "fallback_used" as const,
      },
    };

    const html = renderSlide(slide, 1);
    expect(html).toContain("Mode Referensi Teks");
    expect(html).toContain("AWS CloudWatch Metrics");
  });

  it("assembleCarousel embeds inline base64 images into full HTML", () => {
    const fakeDataUrl = "data:image/jpeg;base64,TEST_BASE64_PAYLOAD";
    const plan = {
      title: "Incident Carousel",
      caption: "Analysis",
      hashtags: ["fyp", "vourdev"],
      slides: [
        {
          role: "cover" as const,
          eyebrow: "INCIDENT REPORT",
          headline: "Kenapa Server Down saat Midnight",
          accentWord: "Server Down",
        },
        {
          role: "point" as const,
          counter: "02 / 02",
          eyebrow: "EVIDENCE",
          headline: "Bukti Log Server",
          accentWord: "Log Server",
          body: "Lihat timestamp berikut.",
          mockup: {
            type: "screenshot" as const,
            screenshotBrief: {
              source: "Kibana Logs",
              mustShow: "OutOfMemory error",
              mustHide: "Host IP",
              cropRatio: "4:5",
            },
            screenshotImage: {
              dataUrl: fakeDataUrl,
              uploadedAt: "2026-08-09T18:00:00Z",
            },
            evidenceStatus: "captured" as const,
          },
        },
      ],
    };

    const fullHtml = assembleCarousel(plan);
    expect(fullHtml).toContain("diag-screenshot");
    expect(fullHtml).toContain(fakeDataUrl);
  });
});
