import { describe, it, expect, vi, beforeAll } from "vitest";

// The audit log is real code with a real client; point it at an in-memory database so
// these tests exercise it instead of stubbing it out, without touching Turso or the repo.
beforeAll(() => {
  process.env.DATABASE_URL = "file::memory:";
  delete process.env.DATABASE_AUTH_TOKEN;
});

import { fulfillWebEvidence } from "../../src/lib/evidence/fulfill";
import type { SlidePlan } from "../../src/lib/ds/schema";
import type { IdentityVerdict } from "../../src/lib/evidence/verify-identity";

function screenshotSlide(source = "OpenCode homepage", extra: Record<string, unknown> = {}) {
  return {
    role: "point",
    counter: "02 / 07",
    eyebrow: "BUKTI",
    headline: "Lihat sendiri di situs resminya",
    body: "Bukti nyata lebih kuat daripada klaim.",
    mockup: {
      type: "screenshot",
      screenshotBrief: { source, mustShow: "hero section", mustHide: "-", cropRatio: "4:5" },
      evidenceStatus: "pending",
      ...extra,
    },
  } as any;
}

function planWith(...slides: any[]): SlidePlan {
  return {
    title: "Evidence test",
    caption: "evidence test",
    hashtags: ["a", "b", "c", "d", "e"],
    slides: [
      { role: "cover", eyebrow: "X", headline: "Cover" },
      ...slides,
      { role: "outro", eyebrow: "Y", headline: "Outro" },
    ],
  } as SlidePlan;
}

/** A candidate proposal, as `proposeOfficialUrls` would return it. */
const proposes = (...hosts: string[]) =>
  async () => ({
    ok: true as const,
    candidates: hosts.map((host, rank) => ({ url: `https://${host}`, host, rank })),
  });

const proposesNothing = (reason: string) => async () => ({ ok: false as const, reason: reason as any });

/** Identity gate stubs. */
const identityPasses = async (): Promise<IdentityVerdict> => ({
  ok: true,
  method: "tokens",
  score: 1,
  matched: ["opencode"],
  signals: {
    finalUrl: "https://opencode.ai/",
    host: "opencode.ai",
    title: "opencode",
    description: "",
    siteName: "opencode",
    heading: "",
  },
});

const identityFails = async (): Promise<IdentityVerdict> => ({
  ok: false,
  method: "no-overlap",
  score: 0,
  matched: [],
  reason: "page says nothing about it",
});

const fakeBrowser = { close: async () => {} } as any;

/** A capture that returns bytes big enough that only the fake validator decides. */
function fakeShot(url: string) {
  return {
    buffer: Buffer.alloc(200_000, 7),
    meta: {
      url,
      finalUrl: url,
      status: 200,
      cookieBanner: "clicked" as const,
      target: "above-the-fold",
      width: 1280,
      height: 1600,
    },
  };
}

const passing = async () => ({
  ok: true as const,
  metrics: { bytes: 200_000, nearWhitePct: 0.4, dominantPct: 0.3, distinctBuckets: 40 },
});

describe("fulfillWebEvidence", () => {
  it("does nothing at all for a deck with no screenshot slide", async () => {
    const propose = vi.fn();
    const capture = vi.fn();
    const browserFactory = vi.fn();
    const plan = planWith({ role: "point", headline: "Biasa", mockup: { type: "checklist", items: ["a"] } });

    const out = await fulfillWebEvidence(plan, {
      path: "user",
      propose: propose as any,
      capture: capture as any,
      browserFactory: browserFactory as any,
    });

    // Same object back, and not one call spent — this is the majority case.
    expect(out.plan).toBe(plan);
    expect(out.attempts).toEqual([]);
    expect(propose).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(browserFactory).not.toHaveBeenCalled();
  });

  it("embeds a validated shot inline as base64 and marks the slide captured", async () => {
    const capture = vi.fn(async (_b: any, url: string) => fakeShot(url));
    const out = await fulfillWebEvidence(planWith(screenshotSlide()), {
      path: "automation",
      propose: proposes("opencode.ai"),
      verify: identityPasses,
      browserFactory: async () => fakeBrowser,
      capture: capture as any,
      validate: passing as any,
    });

    const mockup = (out.plan.slides[1] as any).mockup;
    expect(mockup.evidenceStatus).toBe("captured");
    expect(mockup.screenshotImage.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    // Inline bytes, never a remote URL: the final deck capture runs offline.
    expect(mockup.screenshotImage.dataUrl).not.toContain("http");
    expect(out.attempts[0]).toMatchObject({ outcome: "captured", host: "opencode.ai", path: "automation" });
  });

  it("passes the brief's crop ratio and instruction through to the capture", async () => {
    const capture = vi.fn(async (_b: any, url: string) => fakeShot(url));
    await fulfillWebEvidence(planWith(screenshotSlide()), {
      path: "user",
      propose: proposes("opencode.ai"),
      verify: identityPasses,
      browserFactory: async () => fakeBrowser,
      capture: capture as any,
      validate: passing as any,
    });
    expect(capture).toHaveBeenCalledWith(fakeBrowser, "https://opencode.ai", "hero section", {
      cropRatio: "4:5",
    });
  });

  it("skips the capture when the page is not about the entity", async () => {
    const capture = vi.fn();
    const plan = planWith(screenshotSlide("Zorblax quantum framework"));

    const out = await fulfillWebEvidence(plan, {
      path: "automation",
      // The model was confident; the page it named turns out to be about something else.
      propose: proposes("zorblax.dev"),
      verify: identityFails,
      browserFactory: async () => fakeBrowser,
      capture: capture as any,
    });

    // Nothing is photographed — the identity gate runs before any pixels are spent.
    expect(capture).not.toHaveBeenCalled();
    expect((out.plan.slides[1] as any).mockup.evidenceStatus).toBe("pending");
    expect(out.attempts[0]).toMatchObject({ outcome: "skipped", reason: "identity-mismatch" });
  });

  it("moves on to the next candidate when the first fails the identity gate", async () => {
    const capture = vi.fn(async (_b: any, url: string) => fakeShot(url));
    const verify = vi.fn(async (_b: any, url: string) =>
      url.includes("wrong") ? identityFails() : identityPasses()
    );

    const out = await fulfillWebEvidence(planWith(screenshotSlide()), {
      path: "automation",
      propose: proposes("wrong.example", "opencode.ai"),
      verify: verify as any,
      browserFactory: async () => fakeBrowser,
      capture: capture as any,
      validate: passing as any,
    });

    expect(verify).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]).toBe("https://opencode.ai");
    expect((out.plan.slides[1] as any).mockup.evidenceStatus).toBe("captured");
  });

  it("never opens a browser when the model proposed nothing", async () => {
    const browserFactory = vi.fn();
    const out = await fulfillWebEvidence(planWith(screenshotSlide("Zorblax quantum framework")), {
      path: "automation",
      propose: proposesNothing("no-candidates"),
      browserFactory: browserFactory as any,
    });
    expect(browserFactory).not.toHaveBeenCalled();
    expect(out.attempts[0]).toMatchObject({ outcome: "skipped", reason: "no-candidates" });
  });

  it("drops a shot that fails validation instead of shipping it", async () => {
    const out = await fulfillWebEvidence(planWith(screenshotSlide()), {
      path: "automation",
      propose: proposes("opencode.ai"),
      verify: identityPasses,
      browserFactory: async () => fakeBrowser,
      capture: async (_b: any, url: string) => fakeShot(url),
      validate: async () => ({
        ok: false as const,
        reason: "mostly-blank" as const,
        metrics: { bytes: 30_000, nearWhitePct: 0.97, dominantPct: 0.97, distinctBuckets: 2 },
      }),
    });

    const mockup = (out.plan.slides[1] as any).mockup;
    expect(mockup.evidenceStatus).toBe("pending");
    expect(mockup.screenshotImage).toBeUndefined();
    expect(out.attempts[0]).toMatchObject({ outcome: "rejected", reason: "mostly-blank" });
  });

  it("survives a capture that throws and records it", async () => {
    const out = await fulfillWebEvidence(planWith(screenshotSlide()), {
      path: "user",
      propose: proposes("opencode.ai"),
      verify: identityPasses,
      browserFactory: async () => fakeBrowser,
      capture: async () => {
        throw new Error("HTTP 404 from https://opencode.ai");
      },
    });

    expect((out.plan.slides[1] as any).mockup.evidenceStatus).toBe("pending");
    expect(out.attempts[0]).toMatchObject({ outcome: "error", reason: "HTTP 404 from https://opencode.ai" });
  });

  it("leaves an already-captured slide alone", async () => {
    const propose = vi.fn();
    const slide = screenshotSlide("whatever", {
      evidenceStatus: "captured",
      screenshotImage: { dataUrl: "data:image/png;base64,AAA", uploadedAt: "2026-01-01T00:00:00.000Z" },
    });
    const plan = planWith(slide);

    const out = await fulfillWebEvidence(plan, { path: "user", propose: propose as any });
    expect(out.plan).toBe(plan);
    expect(propose).not.toHaveBeenCalled();
  });

  it("caps how many slides one deck may photograph", async () => {
    const capture = vi.fn(async (_b: any, url: string) => fakeShot(url));
    const out = await fulfillWebEvidence(
      planWith(screenshotSlide("A"), screenshotSlide("B"), screenshotSlide("C")),
      {
        path: "automation",
        propose: proposes("opencode.ai"),
      verify: identityPasses,
        browserFactory: async () => fakeBrowser,
        capture: capture as any,
        validate: passing as any,
        maxSlides: 2,
      }
    );
    expect(capture).toHaveBeenCalledTimes(2);
    expect((out.plan.slides[3] as any).mockup.evidenceStatus).toBe("pending");
  });

  it("closes the browser it opened, even when every capture fails", async () => {
    const close = vi.fn(async () => {});
    await fulfillWebEvidence(planWith(screenshotSlide()), {
      path: "automation",
      propose: proposes("opencode.ai"),
      verify: identityPasses,
      browserFactory: async () => ({ close } as any),
      capture: async () => {
        throw new Error("boom");
      },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
