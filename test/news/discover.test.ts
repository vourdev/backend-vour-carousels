import { describe, it, expect } from "vitest";
import { selectSignificant } from "../../src/lib/news/discover";
import { clusterStories } from "../../src/lib/news/corroborate";
import type { NewsItem } from "../../src/lib/news/fetch-news";

/**
 * A model that answers with whatever text the test hands it — same shape as the double in
 * test/evidence/resolve-url.test.ts, implementing the v2 spec's `doGenerate` so the parsing
 * under test stays under test.
 */
function fakeModel(text: string) {
  return {
    specificationVersion: "v2",
    provider: "test",
    modelId: "test",
    async doGenerate() {
      return {
        content: [{ type: "text", text }],
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
  };
}

function item(publisher: string, group: string, title: string): NewsItem {
  return {
    title,
    url: `https://${group}.example/story`,
    host: `${group}.example`,
    publisher,
    group,
    primary: false,
    summary: "",
    publishedAt: Date.UTC(2026, 8, 21, 12, 0),
  };
}

const clusters = clusterStories([
  item("InfoQ", "infoq", "Google releases Agent Development Kit 1.0 for Kotlin"),
  item("The Register", "theregister", "Google ships Agent Development Kit 1.0 for Kotlin developers"),
]);

describe("selectSignificant", () => {
  it("keeps a pick that points at a real cluster", async () => {
    const picks = await selectSignificant(
      clusters,
      fakeModel(
        JSON.stringify({
          picks: [
            {
              index: 0,
              title: "Google Rilis ADK 1.0 buat Kotlin",
              description: "Agent Development Kit 1.0 kini setara versi Python dan Java untuk ekosistem Kotlin.",
              keywords: ["Kotlin", "ADK", "AI Agents"],
              whyRelevant: "Developer Kotlin bisa bangun AI agent tanpa stack Python.",
              visual: "changelog",
              priority: 9,
            },
          ],
        })
      ) as any,
      3
    );
    expect(picks).toHaveLength(1);
    expect(picks[0].index).toBe(0);
    expect(picks[0].visual).toBe("changelog");
  });

  it("drops a pick whose index points at no cluster", async () => {
    // An invented index has no sources behind it, and a topic with no provenance is the one
    // thing this path may not produce.
    const picks = await selectSignificant(
      clusters,
      fakeModel(
        JSON.stringify({
          picks: [
            {
              index: 7,
              title: "Berita yang tidak ada di daftar",
              description: "Sebuah cerita yang modelnya karang sendiri, di luar kandidat.",
              keywords: ["halusinasi"],
              whyRelevant: "Tidak relevan karena tidak ada sumbernya.",
              visual: "illustration",
              priority: 5,
            },
          ],
        })
      ) as any,
      3
    );
    expect(picks).toHaveLength(0);
  });

  it("collapses two picks that claim the same story", async () => {
    const pick = {
      index: 0,
      description: "Agent Development Kit 1.0 kini setara versi Python dan Java untuk Kotlin.",
      keywords: ["Kotlin"],
      whyRelevant: "Relevan untuk developer Kotlin di Indonesia.",
      visual: "changelog" as const,
      priority: 8,
    };
    const picks = await selectSignificant(
      clusters,
      fakeModel(
        JSON.stringify({
          picks: [
            { ...pick, title: "Google Rilis ADK 1.0 buat Kotlin" },
            { ...pick, title: "ADK 1.0 Akhirnya Dukung Kotlin" },
          ],
        })
      ) as any,
      3
    );
    expect(picks).toHaveLength(1);
  });

  it("returns nothing when the model finds nothing worth writing about", async () => {
    const picks = await selectSignificant(clusters, fakeModel(JSON.stringify({ picks: [] })) as any, 3);
    expect(picks).toEqual([]);
  });

  it("never calls the model when there is nothing corroborated", async () => {
    let called = false;
    const model = {
      specificationVersion: "v2",
      provider: "test",
      modelId: "test",
      async doGenerate() {
        called = true;
        throw new Error("should not be reached");
      },
    };
    expect(await selectSignificant([], model as any, 3)).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("searchNewsItems", () => {
  it("keeps nothing when the search model returns prose with no links", async () => {
    // What `gemini-web` actually does: it searches, then answers as a chat UI. Real stories,
    // no citations. A source with no URL cannot back a topic, so the correct result is zero
    // items and a sweep that carries on with the feeds alone.
    const { searchNewsItems } = await import("../../src/lib/news/search-news");
    const prose =
      "Here are 5 of the biggest technology news stories making waves:\n\n" +
      "### 1. Apple Enters the Foldable Market\nApple unveiled the iPhone Duo at $1,999.\n\n" +
      "### 2. Google Launches Googlebook Laptops\nA hybrid Android and Gemini machine.\n\n" +
      "*Would you like to dive deeper into any of these stories?*";

    const result = await searchNewsItems(fakeModel(prose) as any, {
      formatter: fakeModel(JSON.stringify({ results: [] })) as any,
    });
    expect(result.items).toEqual([]);
    expect(result.stats.kept).toBe(0);
  });

  it("drops a citation that does not resolve", async () => {
    // The guard against an invented source: the URL is fetched before it counts.
    const { searchNewsItems } = await import("../../src/lib/news/search-news");
    const answer = JSON.stringify({
      results: [
        {
          headline: "Deno 3 drops the npm compatibility flag",
          publisher: "InfoQ",
          url: "https://www.infoq.com/news/2026/09/this-article-does-not-exist/",
          publishedAt: "2026-09-22",
        },
      ],
    });

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    try {
      const result = await searchNewsItems(fakeModel(answer) as any, {});
      expect(result.items).toEqual([]);
      expect(result.stats.returned).toBe(1);
      expect(result.stats.unreachable).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("keeps a citation that resolves, keyed to the publisher's feed group", async () => {
    const { searchNewsItems } = await import("../../src/lib/news/search-news");
    const answer = JSON.stringify({
      results: [
        {
          headline: "Google releases Agent Development Kit 1.0 for Kotlin",
          publisher: "InfoQ News",
          url: "https://www.infoq.com/news/2026/09/google-adk-1-0-released/",
          publishedAt: "2026-09-22",
        },
      ],
    });

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok", { status: 206 })) as typeof fetch;
    try {
      const result = await searchNewsItems(fakeModel(answer) as any, {});
      expect(result.items).toHaveLength(1);
      // Mapped onto the registry, so this article and the same one read from InfoQ's feed
      // count as ONE independent source rather than two.
      expect(result.items[0].group).toBe("infoq");
      expect(result.items[0].publisher).toBe("InfoQ");
      expect(result.items[0].primary).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
