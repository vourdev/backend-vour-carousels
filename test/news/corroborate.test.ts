import { describe, it, expect } from "vitest";
import { clusterStories, splitByCorroboration, sameStory, documentFrequency, rarityTest } from "../../src/lib/news/corroborate";
import type { NewsItem } from "../../src/lib/news/fetch-news";

function item(publisher: string, group: string, title: string, over?: Partial<NewsItem>): NewsItem {
  return {
    title,
    url: `https://${group}.example/${encodeURIComponent(title.slice(0, 20))}`,
    host: `${group}.example`,
    publisher,
    group,
    primary: false,
    summary: "",
    imageUrl: null,
    publishedAt: Date.UTC(2026, 8, 21, 12, 0),
    ...over,
  };
}

/**
 * Headlines below are real, taken from one live sweep on 2026-09-21. The false merges they
 * encode all actually happened while this module was being built — each rule exists because
 * one of these pairs got through.
 */
describe("clusterStories", () => {
  it("groups two outlets reporting the same story", () => {
    const items = [
      item("The Verge", "verge", "Bungie says it's 'not done with Destiny' and will bring back vaulted content"),
      item("Engadget", "engadget", "Bungie leaders now say the studio is not done with Destiny"),
    ];
    const clusters = clusterStories(items);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].groups).toEqual(["verge", "engadget"]);
  });

  it("keeps two laws on two continents apart, though the headlines nearly match", () => {
    // Dice similarity here is 0.53 — above the story threshold — because the only thing that
    // differs is the jurisdiction. Nouns cannot separate these; names can.
    const items = [
      item("The Verge", "verge", "California tightens rules on AI data center energy and water use"),
      item("Engadget", "engadget", "The EU will force data centers to disclose their energy and water use"),
    ];
    expect(clusterStories(items)).toHaveLength(2);
  });

  it("does not let a short headline buy its way into a cluster on two generic words", () => {
    // "Why is the Apple Mac Studio so expensive?" has five content words, so two shared ones
    // clear a 0.4 ratio. It was counted as a third source for a Mac mini review.
    const items = [
      item("Ars Technica", "ars", "Apple Mac mini review: The new M6 impresses, but the price hike is rough"),
      item("Wired", "wired", "Apple Mac Mini (M6) Review: Small, Fast, Pricier"),
      item("Engadget", "engadget", "Why is the Apple Mac Studio so expensive?"),
    ];
    const clusters = clusterStories(items);
    const macMini = clusters.find((c) => /mac mini/i.test(c.headline))!;
    expect(macMini.groups).toEqual(["ars", "wired"]);
    expect(clusters.some((c) => /Mac Studio/i.test(c.headline))).toBe(true);
  });

  it("refuses a merge built on a shared price tag", () => {
    const items = [
      item("TechCrunch", "tc", "Discover what's next: 5 days left to save up to $200 on your TechCrunch Disrupt 2026 ticket"),
      item("Wired", "wired", "Save $200 With This Womanizer Coupon Code"),
    ];
    expect(clusterStories(items)).toHaveLength(2);
  });

  it("still clusters when one distinctive name is all two headlines share", () => {
    const items = [
      item("TechCrunch", "tc", "Google's $899 Googlebook is a bet that you'll buy a new laptop for Gemini"),
      item("Wired", "wired", "Got an Android Phone? Google Thinks You'll Probably Want a Googlebook Laptop"),
    ];
    expect(clusterStories(items)).toHaveLength(1);
  });

  it("does not let one publisher's repeats make its own keyword common", () => {
    // Google's newsroom filed four Googlebook posts in one day. Counting occurrences rather
    // than publishers pushed `googlebook` out of the rare band, and the biggest story of the
    // sweep stopped clustering at all.
    const items = [
      item("Google Blog", "google", "Googlebook's built-in intelligence reinvents the way you use your laptop", { primary: true }),
      item("Google Blog", "google", "Premium materials and striking design set Googlebook apart", { primary: true }),
      item("Google Blog", "google", "Pre-order the Googlebook today", { primary: true }),
      item("TechCrunch", "tc", "Google's $899 Googlebook is a bet that you'll buy a new laptop for Gemini"),
      item("Wired", "wired", "Got an Android Phone? Google Thinks You'll Probably Want a Googlebook Laptop"),
    ];
    const df = documentFrequency(items);
    expect(df.get("googlebook")).toBe(3); // three publishers, not five headlines
    expect(rarityTest(df, 3)("googlebook")).toBe(true);
  });

  it("counts a prolific publisher once, and cites it once", () => {
    const items = [
      item("Engadget", "engadget", "Bungie leaders now say the studio is not done with Destiny"),
      item("Engadget", "engadget", "Bungie is not done with Destiny, leaders say in a follow-up"),
      item("The Verge", "verge", "Bungie says it's 'not done with Destiny' and will bring back vaulted content"),
    ];
    const [cluster] = clusterStories(items);
    expect(cluster.items).toHaveLength(3);
    expect(cluster.groups).toEqual(["engadget", "verge"]);
    expect(cluster.sourceUrls).toHaveLength(2);
  });
});

describe("splitByCorroboration", () => {
  const single = [item("TechCrunch", "tc", "Morphotonics raises 40M to expand its display tech into data centers")];
  const pair = [
    item("The Verge", "verge", "Bungie says it's 'not done with Destiny' and will bring back vaulted content"),
    item("Engadget", "engadget", "Bungie leaders now say the studio is not done with Destiny"),
  ];

  it("drops a story only one publisher carried", () => {
    const { passed, rejected } = splitByCorroboration(clusterStories(single), 2);
    expect(passed).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("accepts a story two independent publishers carried", () => {
    const { passed } = splitByCorroboration(clusterStories(pair), 2);
    expect(passed).toHaveLength(1);
    expect(passed[0].publishers).toEqual(["The Verge", "Engadget"]);
  });

  it("refuses a cluster made only of the vendors' own newsrooms", () => {
    // Two press releases about one launch are two sources and no witnesses.
    const vendorOnly = [
      item("Google Blog", "google", "Announcing Gemini CLI 4 with agentic workspace support", { primary: true }),
      item("GitHub Blog", "github", "Announcing Gemini CLI 4 support in GitHub Actions workspace", { primary: true }),
    ];
    const clusters = clusterStories(vendorOnly);
    const { passed, rejected } = splitByCorroboration(clusters, 2);
    if (clusters.length === 1) {
      expect(passed).toHaveLength(0);
      expect(rejected[0].groups).toHaveLength(2);
    } else {
      // Did not even cluster — still rejected, which is the outcome under test.
      expect(passed).toHaveLength(0);
    }
  });

  it("orders accepted clusters by how well corroborated they are", () => {
    const three = [
      ...pair,
      item("Ars Technica", "ars", "Bungie confirms it is not done with Destiny and will unvault content"),
      item("Wired", "wired", "Apple Mac Mini (M6) Review: Small, Fast, Pricier"),
      item("Ars Technica", "ars2", "Apple Mac mini review: the new M6 impresses, but the price hike is rough"),
    ];
    const { passed } = splitByCorroboration(clusterStories(three), 2);
    expect(passed[0].groups.length).toBeGreaterThanOrEqual(passed[passed.length - 1].groups.length);
  });
});

describe("sameStory without a rarity oracle", () => {
  it("falls back to the stricter ratio and still matches a clear rephrase", () => {
    expect(
      sameStory(
        "Bungie says it is not done with Destiny",
        "Bungie is not done with Destiny, says Bungie"
      )
    ).toBe(true);
  });

  it("does not match two unrelated headlines", () => {
    expect(sameStory("Deno 3 drops the npm compatibility flag", "Apple raises Mac mini prices")).toBe(false);
  });
});

describe("gambar klaster", () => {
  it("memilih gambar milik newsroom vendor, bukan milik pers", () => {
    // Both carry a picture; only the vendor's may be republished, and the press item is
    // deliberately the one listed first to prove order is not what decides it.
    const items = [
      item("The Verge", "verge", "Google ships Gemini 3.8 Live with avatars for developers", {
        imageUrl: "https://cdn.vox-cdn.com/getty-photo.jpg",
      }),
      item("Google DeepMind", "deepmind", "Introducing Gemini 3.8 Live with Live Avatar", {
        primary: true,
        imageUrl: "https://deepmind.google/img/hero.jpg",
      }),
    ];
    const [cluster] = clusterStories(items);
    expect(cluster.imageUrl).toBe("https://deepmind.google/img/hero.jpg");
  });

  it("null ketika tidak ada anggota yang membawa gambar", () => {
    const items = [
      item("Ars Technica", "arstechnica", "Google ships Gemini 3.8 Live with avatars for developers"),
      item("Engadget", "engadget", "Gemini 3.8 Live arrives with Live Avatar for developers"),
    ];
    const [cluster] = clusterStories(items);
    expect(cluster.imageUrl).toBeNull();
  });
});
