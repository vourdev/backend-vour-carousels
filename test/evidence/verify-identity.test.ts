import { describe, it, expect } from "vitest";
import { entityTokens, scoreIdentity, verifyPageIdentity } from "../../src/lib/evidence/verify-identity";

const signals = (over: Partial<Parameters<typeof scoreIdentity>[1]> = {}) => ({
  host: "opencode.ai",
  title: "opencode | The open source AI coding agent",
  description: "Free models included or connect any model from any provider.",
  siteName: "opencode",
  heading: "The open source AI coding agent",
  ...over,
});

describe("entityTokens", () => {
  it("drops the words that describe the request rather than the thing", () => {
    // "OpenCode homepage" is one real token; without the filter every page whose title
    // says "Home" would score half a match.
    expect(entityTokens("OpenCode homepage")).toEqual(["opencode"]);
    expect(entityTokens("halaman utama situs resmi Vercel")).toEqual(["vercel"]);
  });

  it("orders by length so the most distinctive token is first", () => {
    expect(entityTokens("Zorblax quantum framework")[0]).toBe("framework");
  });
});

describe("scoreIdentity", () => {
  it("matches a project whose domain is its name, with no help from the title", () => {
    const out = scoreIdentity("OpenCode homepage", signals({ title: "", siteName: "", heading: "", description: "" }));
    expect(out.score).toBe(1);
    expect(out.primaryMatched).toBe(true);
  });

  it("scores zero for a page that says nothing about the entity", () => {
    const out = scoreIdentity("OpenCode homepage", signals({
      host: "example.com",
      title: "Example Domain",
      description: "This domain is for use in illustrative examples in documents.",
      siteName: "",
      heading: "Example Domain",
    }));
    expect(out.score).toBe(0);
  });

  it("does not count a match on the generic half of a name alone", () => {
    // "quantum framework" would match half of any framework's landing page; the
    // distinctive token is what has to land.
    const out = scoreIdentity("Zorblax quantum framework", signals({
      host: "nextjs.org",
      title: "Next.js by Vercel - The React Framework",
      description: "Used by some of the world's largest companies.",
      siteName: "Next.js",
      heading: "The React Framework for the Web",
    }));
    expect(out.primaryMatched).toBe(true); // "framework" is present
    expect(out.matched).not.toContain("zorblax");
    expect(out.score).toBeLessThan(0.5);
  });
});

/** A page whose signals are supplied directly, so no browser is needed. */
const withSignals = (over: Record<string, string>) => ({
  signals: {
    finalUrl: "https://opencode.ai/",
    host: "opencode.ai",
    title: "opencode | The open source AI coding agent",
    description: "",
    siteName: "opencode",
    heading: "",
    ...over,
  } as any,
});

describe("verifyPageIdentity", () => {
  it("accepts on token overlap alone, spending no model call", async () => {
    const verdict = await verifyPageIdentity({} as any, "https://opencode.ai", "OpenCode homepage", {
      ...withSignals({}),
      // If it reached the judge this would throw, which is the assertion.
      judge: { get provider(): string { throw new Error("judge must not be called"); } } as any,
    });
    expect(verdict).toMatchObject({ ok: true, method: "tokens", score: 1 });
  });

  it("rejects a page with no overlap without asking a model", async () => {
    const verdict = await verifyPageIdentity({} as any, "https://example.com", "OpenCode homepage", {
      ...withSignals({
        host: "example.com",
        title: "Example Domain",
        siteName: "",
        description: "This domain is for use in illustrative examples.",
      }),
      judge: { get provider(): string { throw new Error("judge must not be called"); } } as any,
    });
    expect(verdict).toMatchObject({ ok: false, method: "no-overlap" });
    expect(verdict.reason).toContain("Example Domain");
  });

  it("fails closed on a partial match when no judge is available", async () => {
    const verdict = await verifyPageIdentity({} as any, "https://nextjs.org", "Zorblax quantum framework", {
      ...withSignals({
        host: "nextjs.org",
        title: "Next.js by Vercel - The React Framework",
        siteName: "Next.js",
      }),
      judge: null,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("no model");
  });

  it("lets the judge decide an ambiguous page", async () => {
    const judge = (text: string) =>
      ({
        specificationVersion: "v2",
        provider: "test",
        modelId: "test",
        supportedUrls: {},
        async doGenerate() {
          return {
            content: [{ type: "text" as const, text }],
            finishReason: "stop" as const,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            warnings: [],
          };
        },
      }) as any;

    const partial = withSignals({ host: "nextjs.org", title: "Next.js by Vercel - The React Framework", siteName: "Next.js" });

    const no = await verifyPageIdentity({} as any, "https://nextjs.org", "Zorblax quantum framework", {
      ...partial,
      judge: judge('{"match": false}'),
    });
    expect(no).toMatchObject({ ok: false, method: "llm" });

    const yes = await verifyPageIdentity({} as any, "https://nextjs.org", "Zorblax quantum framework", {
      ...partial,
      judge: judge('{"match": true}'),
    });
    expect(yes).toMatchObject({ ok: true, method: "llm" });
  });

  it("treats a judge that throws as a rejection, not as approval", async () => {
    const boom = {
      specificationVersion: "v2",
      provider: "test",
      modelId: "test",
      supportedUrls: {},
      async doGenerate() {
        throw new Error("upstream 503");
      },
    } as any;
    const verdict = await verifyPageIdentity({} as any, "https://nextjs.org", "Zorblax quantum framework", {
      ...withSignals({ host: "nextjs.org", title: "Next.js by Vercel - The React Framework", siteName: "Next.js" }),
      judge: boom,
    });
    expect(verdict).toMatchObject({ ok: false, method: "llm", reason: "identity judge unavailable" });
  });
});
