import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderSlide } from "../../src/lib/ds/render-slide";
import { assembleCarousel } from "../../src/lib/ds/assemble";
import type { SlidePlan } from "../../src/lib/ds/schema";

const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

/**
 * Import lines only. The prose in these modules names the other side on purpose — it is
 * where the reason for the split is written down — so a raw text match would fail on the
 * documentation that exists to prevent the very thing being tested.
 */
const imports = (p: string) =>
  src(p)
    .split("\n")
    .filter((l) => /^\s*(import|export)\s.*from\s|require\(/.test(l))
    .join("\n");

/**
 * The deck export is offline and stays offline.
 *
 * Web evidence is the first thing in this service that opens a socket from a browser, and
 * the temptation it creates is to reuse the browser that is already running. That would
 * put the finished carousel's export one third-party outage away from failing at midnight
 * in the cron, where nobody is watching. These tests are the fence.
 */
describe("offline capture isolation", () => {
  const OFFLINE_MODULES = [
    "lib/export/capture.ts",
    "lib/export/capture-server.ts",
    "services/capture-queue.ts",
  ];

  for (const mod of OFFLINE_MODULES) {
    it(`${mod} never navigates to a URL`, () => {
      const code = src(mod);
      // setContent is how the deck is loaded; goto would mean a network fetch.
      expect(code).not.toMatch(/\.goto\s*\(/);
      expect(code).not.toMatch(/https?:\/\/(?!\S*schema)/);
    });

    it(`${mod} does not import the evidence subsystem`, () => {
      expect(imports(mod)).not.toMatch(/evidence\//);
    });
  }

  it("the evidence capture never borrows the shared render browser", () => {
    const code = imports("lib/evidence/capture-web.ts");
    expect(code).not.toMatch(/capture-queue/);
    expect(code).not.toMatch(/captureQueue/);
    // It owns its Chromium instead — launched, used and closed by this module.
    expect(src("lib/evidence/capture-web.ts")).toMatch(/chromium\.launch\(/);
  });

  it("no evidence module reaches into the deck export path", () => {
    for (const mod of ["lib/evidence/capture-web.ts", "lib/evidence/fulfill.ts", "lib/evidence/validate.ts"]) {
      expect(imports(mod)).not.toMatch(/export\/capture/);
    }
  });

  it("a captured slide renders inline bytes, not a remote image", () => {
    const html = renderSlide(
      {
        role: "point",
        counter: "02 / 07",
        eyebrow: "BUKTI",
        headline: "Bukti nyata",
        body: "x",
        mockup: {
          type: "screenshot",
          evidenceStatus: "captured",
          screenshotImage: { dataUrl: "data:image/jpeg;base64,AAAA", uploadedAt: "2026-01-01T00:00:00.000Z" },
        },
      } as any,
      1,
      2
    );
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
    expect(html).not.toMatch(/src="https?:/);
  });

  it("an assembled deck carrying evidence has no outbound asset reference", () => {
    const plan = {
      title: "t",
      caption: "c",
      hashtags: ["a", "b", "c", "d", "e"],
      slides: [
        { role: "cover", eyebrow: "E", headline: "H" },
        {
          role: "point",
          counter: "02 / 03",
          eyebrow: "BUKTI",
          headline: "Bukti",
          body: "x",
          mockup: {
            type: "screenshot",
            evidenceStatus: "captured",
            screenshotImage: { dataUrl: "data:image/jpeg;base64,AAAA", uploadedAt: "2026-01-01T00:00:00.000Z" },
          },
        },
        { role: "outro", eyebrow: "E", headline: "H" },
      ],
    } as SlidePlan;

    const html = assembleCarousel(plan);
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
    expect(html).not.toMatch(/<link[^>]+href="https?:/);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
  });
});
