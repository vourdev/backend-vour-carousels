import { describe, it, expect } from "vitest";
import { parseFeed, toPlainText, decodeEntities } from "../../src/lib/news/parse-feed";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example Tech</title>
    <item>
      <title><![CDATA[Bun 2.0 ships a native test runner]]></title>
      <link>https://example.com/bun-2-0</link>
      <pubDate>Mon, 22 Sep 2026 08:30:00 +0000</pubDate>
      <description><![CDATA[<p>The release <strong>replaces</strong> jest &amp; vitest shims.</p>]]></description>
      <media:content url="https://example.com/photo.jpg" medium="image" />
      <enclosure url="https://example.com/cover.png" type="image/png" />
    </item>
    <item>
      <title>An item with no link at all</title>
      <description>Should be dropped.</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Deno 3 drops the npm compatibility flag</title>
    <link rel="alternate" href="https://example.org/deno-3" />
    <link rel="edit" href="https://example.org/edit/deno-3" />
    <published>2026-09-21T22:15:00Z</published>
    <summary type="html">Compatibility is now &lt;b&gt;on by default&lt;/b&gt;.</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads an RSS item down to title, link, date and plain-text summary", () => {
    const [item] = parseFeed(RSS);
    expect(item.title).toBe("Bun 2.0 ships a native test runner");
    expect(item.link).toBe("https://example.com/bun-2-0");
    expect(item.summary).toBe("The release replaces jest & vitest shims.");
    expect(new Date(item.publishedAt!).toISOString()).toBe("2026-09-22T08:30:00.000Z");
  });

  it("never carries an image URL out of a feed", () => {
    // The whole point of reading text feeds: a news outlet's photography must not reach the
    // pipeline, not even as a string something could later fetch.
    const serialised = JSON.stringify(parseFeed(RSS));
    expect(serialised).not.toContain("photo.jpg");
    expect(serialised).not.toContain("cover.png");
  });

  it("drops an item with no usable URL, because an uncitable source is not a source", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(1);
    expect(items.map((i) => i.title)).not.toContain("An item with no link at all");
  });

  it("prefers Atom's rel=alternate link over any other link element", () => {
    const [entry] = parseFeed(ATOM);
    expect(entry.link).toBe("https://example.org/deno-3");
    expect(entry.summary).toBe("Compatibility is now on by default.");
  });

  it("decodes the entities feeds actually emit", () => {
    expect(decodeEntities("AT&amp;T &#8212; Google&#39;s plan")).toBe("AT&T — Google's plan");
    expect(toPlainText("<p>a   b</p>\n<p>c</p>")).toBe("a b c");
  });
});

describe("source URL hygiene", () => {
  it("strips campaign parameters from a feed link", async () => {
    // InfoQ appends utm_* to every link in its feed, and those URLs end up stored as a
    // topic's provenance — a citation should be the article's address, not a record of how
    // we found it.
    const { fetchNewsItems } = await import("../../src/lib/news/fetch-news");
    const xml = `<?xml version="1.0"?><rss><channel><item>
      <title>Google releases Agent Development Kit 1.0 for Kotlin</title>
      <link>https://www.infoq.com/news/2026/09/google-adk/?utm_campaign=infoq_content&amp;utm_source=infoq&amp;id=42#top</link>
      <pubDate>Mon, 22 Sep 2026 08:00:00 +0000</pubDate>
    </item></channel></rss>`;

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(xml, { status: 200, headers: { "content-type": "application/xml" } })) as typeof fetch;
    try {
      const { items } = await fetchNewsItems({
        feeds: [{ publisher: "InfoQ", url: "https://feed.infoq.com/", group: "infoq" }],
      });
      expect(items).toHaveLength(1);
      // `id` is a real query parameter and stays; the campaign tail and the fragment go.
      expect(items[0].url).toBe("https://www.infoq.com/news/2026/09/google-adk/?id=42");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
