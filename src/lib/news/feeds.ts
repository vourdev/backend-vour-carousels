/**
 * Where trending tech news comes from.
 *
 * Feeds, not a search model. The brief asked for this to run through OmniRoute's grounded
 * search, and there is none: `gemini-web/*` answers 500 (`Failed to load external module
 * playwright`), `felo/felo-search` 400, `tllm/sonar-pro` 403 (Vercel blocks the egress IP).
 * Asking a plain model for "today's news" returns its training data wearing a timestamp,
 * which is the exact failure `noteResearchUnavailable` in lib/topics/generator.ts refuses
 * to ship.
 *
 * A publisher's own RSS feed has what a search was wanted for and nothing it was feared
 * for: real headlines, real URLs, real publication times, no quota, no hallucination. The
 * model still runs — it judges significance over text it did not write — but it can no
 * longer invent a story or a link.
 *
 * Hacker News is deliberately absent. Its items are other people's URLs, so it reports no
 * story of its own: counting an HN link to an Ars article as a second source next to Ars
 * itself is exactly the double-count the independence rule exists to stop. Live proof from
 * the first sweep — HN "corroborated" Terence Tao's blog post about OpenAI's maths advisory
 * group, which is the same announcement from the same day, not a second witness.
 *
 * Vercel's changelog feed is deliberately absent: it answers 3.5 MB of mostly one-line
 * platform notes, which is a large daily download for very little signal.
 *
 * Antara, Kompas Tekno and Detik are absent for a duller reason: they answer this VPS with
 * 403 or refuse the connection outright, while answering a laptop in Indonesia normally. A
 * feed is only worth listing if it works from where the sweep runs, so every entry here was
 * checked from the box itself, not from a development machine. The Register and DevClass
 * fail the same way and are kept only because they predate that rule.
 *
 * IMAGES: press photography stays off limits. A news outlet's pictures belong to the outlet,
 * the photographer, or a wire service, and "the URL is public" is not a licence. The parser
 * drops `<media:content>` and `<enclosure>` for every feed except the ones flagged
 * `imagesAllowed`, which are vendor newsrooms publishing their own product shots and press
 * assets -- material put out to be republished. Owner's decision, 26 Sep 2026, taken over the
 * alternative of scraping any source whose URL happened to resolve.
 */

export interface NewsFeed {
  /** Publisher name as it should appear to a human. */
  publisher: string;
  url: string;
  /**
   * Independence key. Two feeds sharing a key never corroborate each other — a network's
   * sibling titles reprinting one wire story is one source, not two.
   */
  group: string;
  /**
   * Apex host this publisher's articles live on.
   *
   * Needed because grounded search (./search-news.ts) returns bare URLs with no feed behind
   * them, and its items have to share an independence key with the same publisher's feed
   * items. Without this map a TechCrunch article found by search and the same TechCrunch
   * article read from its feed would count as two independent sources — one publisher
   * manufacturing its own corroboration.
   */
  host: string;
  /**
   * A vendor's own newsroom. Primary sources are the best evidence that a release happened
   * and no evidence at all that it matters: a company announcing its own product cannot
   * corroborate itself. See `splitByCorroboration`, which requires at least one independent
   * outlet in every accepted cluster.
   */
  primary?: boolean;
  /**
   * Whether this feed's own images may be republished.
   *
   * True only for a vendor's newsroom, where the picture is the company's own screenshot,
   * diagram or press asset. Never true for a press outlet: their photography is licensed,
   * often from a wire service, and a public URL grants nothing. See the file header.
   */
  imagesAllowed?: boolean;
}

export const NEWS_FEEDS: NewsFeed[] = [
  { publisher: "TechCrunch", url: "https://techcrunch.com/feed/", host: "techcrunch.com", group: "techcrunch" },
  { publisher: "The Verge", url: "https://www.theverge.com/rss/index.xml", host: "theverge.com", group: "verge" },
  { publisher: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", host: "arstechnica.com", group: "arstechnica" },
  { publisher: "Engadget", url: "https://www.engadget.com/rss.xml", host: "engadget.com", group: "engadget" },
  { publisher: "Wired", url: "https://www.wired.com/feed/rss", host: "wired.com", group: "wired" },
  { publisher: "VentureBeat", url: "https://feeds.feedburner.com/venturebeat/SZYF", host: "venturebeat.com", group: "venturebeat" },
  { publisher: "The Register", url: "https://www.theregister.com/headlines.atom", host: "theregister.com", group: "theregister" },
  { publisher: "DevClass", url: "https://devclass.com/feed/", host: "devclass.com", group: "devclass" },
  { publisher: "InfoQ", url: "https://feed.infoq.com/", host: "infoq.com", group: "infoq" },
  { publisher: "ZDNET", url: "https://www.zdnet.com/news/rss.xml", host: "zdnet.com", group: "zdnet" },
  { publisher: "Stack Overflow Blog", url: "https://stackoverflow.blog/feed/", host: "stackoverflow.blog", group: "stackoverflow" },

  // Vendor newsrooms. Primary sources: they prove a release happened, and they never
  // corroborate it — see NewsFeed.primary. They are here because the developer stories worth
  // writing about START here, and the press coverage that confirms them is above.
  { publisher: "GitHub Blog", url: "https://github.blog/feed/", host: "github.blog", group: "github", primary: true, imagesAllowed: true },
  { publisher: "GitHub Changelog", url: "https://github.blog/changelog/feed/", host: "github.blog", group: "github", primary: true, imagesAllowed: true },
  { publisher: "Node.js Blog", url: "https://nodejs.org/en/feed/blog.xml", host: "nodejs.org", group: "nodejs", primary: true, imagesAllowed: true },
  { publisher: "Deno Blog", url: "https://deno.com/feed", host: "deno.com", group: "deno", primary: true, imagesAllowed: true },
  { publisher: "Bun Blog", url: "https://bun.sh/rss.xml", host: "bun.sh", group: "bun", primary: true, imagesAllowed: true },
  { publisher: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", host: "blog.cloudflare.com", group: "cloudflare", primary: true, imagesAllowed: true },
  { publisher: "Docker Blog", url: "https://www.docker.com/blog/feed/", host: "docker.com", group: "docker", primary: true, imagesAllowed: true },
  { publisher: "Google Developers", url: "https://developers.googleblog.com/feeds/posts/default", host: "developers.googleblog.com", group: "googledev", primary: true, imagesAllowed: true },
  { publisher: "Microsoft DevBlogs", url: "https://devblogs.microsoft.com/feed/", host: "devblogs.microsoft.com", group: "microsoft", primary: true, imagesAllowed: true },
  { publisher: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", host: "huggingface.co", group: "huggingface", primary: true, imagesAllowed: true },
  { publisher: "Google Blog", url: "https://blog.google/rss/", host: "blog.google", group: "google", primary: true, imagesAllowed: true },
  { publisher: "OpenAI News", url: "https://openai.com/news/rss.xml", host: "openai.com", group: "openai", primary: true, imagesAllowed: true },
  { publisher: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", host: "deepmind.google", group: "deepmind", primary: true, imagesAllowed: true },
  { publisher: "Mistral AI", url: "https://mistral.ai/rss.xml", host: "mistral.ai", group: "mistral", primary: true, imagesAllowed: true },

  // Security desks. Their stories are the ones an institution acts on -- a CVE, a breach, a
  // vendor advisory -- and they corroborate each other without touching the product press
  // above, so a security story needs two security outlets to agree before it ships.
  { publisher: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", host: "thehackernews.com", group: "thehackernews" },
  { publisher: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", host: "bleepingcomputer.com", group: "bleepingcomputer" },
  { publisher: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", host: "krebsonsecurity.com", group: "krebs" },

  // Indonesian desks. They report the same releases for a local audience and they report
  // things the English press never covers -- regulation, local launches, public-sector
  // rollouts -- which is the half BTU's readers actually act on. Indonesian headlines only
  // cluster with other Indonesian headlines, so these corroborate each other rather than
  // diluting the English pool.
  { publisher: "DailySocial", url: "https://dailysocial.id/feed", host: "dailysocial.id", group: "dailysocial" },
  { publisher: "CNBC Indonesia Tech", url: "https://www.cnbcindonesia.com/tech/rss", host: "cnbcindonesia.com", group: "cnbcindonesia" },
  { publisher: "Tempo Tekno", url: "https://rss.tempo.co/tekno", host: "tempo.co", group: "tempo" },
  { publisher: "Liputan6 Tekno", url: "https://feed.liputan6.com/rss/tekno", host: "liputan6.com", group: "liputan6" },
  { publisher: "Katadata Digital", url: "https://katadata.co.id/rss/digital", host: "katadata.co.id", group: "katadata" },
];

/** Apex form of a host, so `www.infoq.com` and `infoq.com` compare equal. */
export function apexHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

/**
 * Which independence key a bare URL belongs to.
 *
 * Grounded search hands back URLs with no feed attached. Matching them onto the feed registry
 * keeps one publisher counting once however we found it; anything unrecognised becomes its own
 * key derived from the host, which is the correct default — an outlet we do not subscribe to
 * is still an independent outlet.
 */
export function groupForHost(host: string): { group: string; publisher: string; primary: boolean } {
  const apex = apexHost(host);
  for (const feed of NEWS_FEEDS) {
    const feedApex = apexHost(feed.host);
    if (apex === feedApex || apex.endsWith(`.${feedApex}`)) {
      return { group: feed.group, publisher: feed.publisher, primary: feed.primary === true };
    }
  }
  return { group: apex, publisher: apex, primary: false };
}

/**
 * Hosts that publish about the thing rather than being the thing.
 *
 * Exported for lib/evidence/resolve-url.ts, which must never accept one of these as an
 * entity's "official site" — screenshotting the article we read the story in is precisely
 * the image-reuse this feature is built to avoid. Kept here, beside the feed list, so
 * adding a feed cannot forget to block its host.
 */
export const NEWS_HOSTS: string[] = [
  "techcrunch.com",
  "theregister.com",
  "devclass.com",
  "infoq.com",
  "stackoverflow.blog",
  "theverge.com",
  "arstechnica.com",
  "engadget.com",
  "wired.com",
  "venturebeat.com",
  "feedburner.com",
  "news.ycombinator.com",
  "ycombinator.com",
  "zdnet.com",
  "cnet.com",
  "thenextweb.com",
  "techradar.com",
  "gizmodo.com",
  "theregister.com",
  "infoworld.com",
  "zdnet.co.uk",
  "bleepingcomputer.com",
  "hackernoon.com",
  "techspot.com",
  "tomshardware.com",
  "9to5mac.com",
  "9to5google.com",
  "androidauthority.com",
  "androidpolice.com",
  "macrumors.com",
  "businessinsider.com",
  "bloomberg.com",
  "reuters.com",
  "cnbc.com",
  "ft.com",
  "nytimes.com",
  "wsj.com",
  "detik.com",
  "kompas.com",
  "tempo.co",
  "kumparan.com",
  "liputan6.com",
  "cnnindonesia.com",
];
