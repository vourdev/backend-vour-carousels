import { NEWS_FEEDS, type NewsFeed } from "./feeds";
import { parseFeed } from "./parse-feed";

/** One story as one publisher told it. */
export interface NewsItem {
  title: string;
  url: string;
  host: string;
  publisher: string;
  /** Independence key from the feed registry — see NewsFeed.group. */
  group: string;
  /** True when this is the subject's own newsroom — see NewsFeed.primary. */
  primary: boolean;
  /**
   * The publisher's own picture for this story, and only from a feed allowed to give one.
   * Null for every press outlet — see the images note in ./feeds.ts.
   */
  imageUrl: string | null;
  summary: string;
  publishedAt: number | null;
}

export interface FetchNewsResult {
  items: NewsItem[];
  /** Per-feed outcome, so a silently dead feed shows up in the log instead of as thin news. */
  feeds: { publisher: string; ok: boolean; count: number; detail?: string }[];
}

const FEED_TIMEOUT_MS = 20_000;

/**
 * Ceiling on one feed's body.
 *
 * Only the newest couple of dozen entries are ever read, but a feed that publishes its whole
 * archive hands over everything anyway — Vercel's changelog is 3.5 MB of it. This keeps one
 * verbose or misbehaving publisher from deciding how much memory a sweep uses.
 */
const MAX_FEED_BYTES = 4_000_000;

/**
 * A browser-ish User-Agent.
 *
 * Several outlets answer a default Node UA with 403 — the same class of trap as Cloudflare
 * blocking `Python-urllib` on the status probe. The name is still honest about what this is.
 */
const UA = "Mozilla/5.0 (compatible; VourTopicBot/1.0; +https://vour.dev)";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Campaign parameters, off.
 *
 * These URLs are stored as a topic's provenance and read back by a human and by the blog
 * generator, so they should be the article's address and nothing else. InfoQ's feed appends
 * `?utm_campaign=infoq_content&utm_source=infoq&utm_medium=feed&utm_term=global` to every
 * link; keeping that means every citation carries a tracking tail that says how WE found it.
 */
const TRACKING_PARAMS = /^(utm_|ref_|mc_|pk_|hsa_|_hs|at_)|^(fbclid|gclid|dclid|msclkid|igshid|ref|source|cmpid|CMP|smid)$/i;

export function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

async function fetchOne(feed: NewsFeed, maxItems: number): Promise<{ items: NewsItem[]; detail?: string }> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_FEED_BYTES) {
    throw new Error(`feed too large: ${Math.round(declared / 1024)} KB`);
  }

  const xml = (await res.text()).slice(0, MAX_FEED_BYTES);
  const raw = parseFeed(xml, { maxItems, images: feed.imagesAllowed === true });

  const items: NewsItem[] = [];
  for (const item of raw) {
    const host = hostOf(item.link);
    if (!host) continue;
    items.push({
      title: item.title,
      url: cleanUrl(item.link),
      host,
      publisher: feed.publisher,
      group: feed.group,
      primary: feed.primary === true,
      summary: item.summary,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
    });
  }
  return { items, detail: raw.length === 0 ? `parsed 0 items from ${xml.length} bytes` : undefined };
}

export interface FetchNewsOptions {
  /** Drop anything older than this. Undated items are kept — some feeds omit the date. */
  withinHours?: number;
  maxItemsPerFeed?: number;
  feeds?: NewsFeed[];
}

/**
 * Read every feed once, in parallel, and never let one bad feed fail the run.
 *
 * A feed that 403s or reshapes its XML is normal operating weather; the corroboration rule
 * downstream is what protects quality, and it only gets stronger with more feeds alive.
 */
export async function fetchNewsItems(opts: FetchNewsOptions = {}): Promise<FetchNewsResult> {
  const feeds = opts.feeds ?? NEWS_FEEDS;
  const maxItems = opts.maxItemsPerFeed ?? 30;
  const cutoff =
    opts.withinHours && opts.withinHours > 0 ? Date.now() - opts.withinHours * 3_600_000 : null;

  const settled = await Promise.allSettled(feeds.map((f) => fetchOne(f, maxItems)));

  const items: NewsItem[] = [];
  const report: FetchNewsResult["feeds"] = [];

  settled.forEach((outcome, i) => {
    const feed = feeds[i];
    if (outcome.status === "rejected") {
      const detail = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      report.push({ publisher: feed.publisher, ok: false, count: 0, detail });
      console.warn(`[news] ${feed.publisher} unreachable: ${detail}`);
      return;
    }
    const fresh = cutoff
      ? outcome.value.items.filter((it) => it.publishedAt === null || it.publishedAt >= cutoff)
      : outcome.value.items;
    items.push(...fresh);
    report.push({
      publisher: feed.publisher,
      ok: true,
      count: fresh.length,
      detail: outcome.value.detail,
    });
  });

  return { items, feeds: report };
}
