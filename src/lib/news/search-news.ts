import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { aiCallDefaults } from "../ai/registry";
import { groupForHost } from "./feeds";
import type { NewsItem } from "./fetch-news";

/**
 * Grounded web search, as a SECOND source of headlines beside the feeds.
 *
 * Alive again since 22 Sep 2026. It was dark because the OmniRoute deployment ran the plain
 * `diegosouzapw/omniroute:3.8.50` image, which ships `playwright` with its nested
 * `playwright-core` pruned (no `browsers.json`) and no browser binaries — so every
 * browser-transport provider answered `500 Failed to load external module playwright`. The
 * `-web` image variant is the one built for those providers: complete playwright-core,
 * chromium preinstalled, `PLAYWRIGHT_BROWSERS_PATH` set. Switching tags fixed it.
 *
 * It does NOT replace the feeds, and it does not get to skip a single gate:
 *
 *  - Every result is a plain `NewsItem` and goes through the same clustering and the same
 *    "two independent publishers" rule. A story only search found still needs a second
 *    witness before it can become a topic.
 *  - Independence is keyed by publisher, mapped through `groupForHost`, so the same
 *    TechCrunch article found twice — once by search, once from its feed — counts once.
 *  - Every URL is FETCHED before it is allowed to stand as a source. A model that invents a
 *    citation is the exact failure this whole module exists to prevent, and a 404 is cheap to
 *    detect. Feed items skip this: they came from the publisher's own feed.
 */

const resultSchema = z.object({
  headline: z.string().min(8).max(300),
  publisher: z.string().min(2).max(80),
  url: z.string().url(),
  /** ISO date, when the model knows it. Unparseable values become null, never a guess. */
  publishedAt: z.string().optional(),
});

const resultListSchema = z.object({ results: z.array(resultSchema) });

/**
 * Ask in prose, not JSON.
 *
 * `gemini-web` is the consumer Gemini web app driven through a browser, not an API. Asked for
 * "ONLY this JSON, no prose" it answers with a headed, bulleted briefing and closes by asking
 * whether you would like to dive deeper — and in that mode it omits URLs entirely. Asked in
 * its own idiom for a numbered list with a labelled URL per item, it gives real, working links.
 *
 * So the search model is asked the way it wants to be asked, and a second, ordinary model turns
 * the answer into JSON. The formatter cannot add a source that is not in the prose, and
 * anything it gets wrong dies at the URL check.
 */
const SEARCH_SYSTEM = `You are a technology news researcher with live web access.

Always search the web before answering — never answer from memory.
For every story you report you MUST give the publisher and the full article URL you found.
Do not include a story you have no URL for.`;

const STRUCTURE_SYSTEM = `You convert a news briefing into JSON. You add nothing.

Rules:
- Use ONLY stories that appear in the text given to you.
- Copy each URL character for character. Never repair, shorten, or guess a URL.
- Skip any story with no URL in the text. Do not invent one.
- Reply with ONLY this JSON, no prose, no code fence:
{"results":[{"headline":"...","publisher":"...","url":"https://...","publishedAt":"2026-09-22"}]}
- Nothing usable in the text? Reply {"results":[]}.`;

function extractAndParseJson(rawText: string): unknown {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const open = cleaned.indexOf("{");
  const close = cleaned.lastIndexOf("}");
  if (open !== -1 && close > open) cleaned = cleaned.slice(open, close + 1);
  return JSON.parse(cleaned);
}

/** The model that can actually search. Unset means "don't search at all". */
export function searchModelId(): string | null {
  const raw = (process.env.NEWS_SEARCH_MODEL ?? "").trim();
  return raw && raw.toLowerCase() !== "off" ? raw : null;
}

const VERIFY_TIMEOUT_MS = 15_000;
const VERIFY_CONCURRENCY = 4;

/**
 * Does this URL exist?
 *
 * GET with a ranged request rather than HEAD: several outlets answer HEAD with 405 while the
 * page itself is fine, and a false negative here silently discards a real source. 403 counts
 * as existing — Cloudflare turning away a bot says nothing about whether the article is
 * there, and the URL is only ever stored as text for a human to open.
 */
async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VourTopicBot/1.0; +https://vour.dev)",
        Range: "bytes=0-2047",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    return res.status < 400 || res.status === 403 || res.status === 429;
  } catch {
    return false;
  }
}

async function verifyAll(urls: string[]): Promise<Set<string>> {
  const alive = new Set<string>();
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(VERIFY_CONCURRENCY, queue.length) }, async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      if (await urlExists(url)) alive.add(url);
    }
  });
  await Promise.all(workers);
  return alive;
}

export interface SearchNewsResult {
  items: NewsItem[];
  /** Counters worth logging: a model that hallucinates citations shows up here first. */
  stats: { returned: number; malformed: number; unreachable: number; kept: number };
}

export async function searchNewsItems(
  model: LanguageModel,
  opts: { withinHours?: number; maxResults?: number; formatter?: LanguageModel } = {}
): Promise<SearchNewsResult> {
  const withinHours = opts.withinHours ?? 48;
  const maxResults = Math.min(Math.max(opts.maxResults ?? 20, 1), 40);
  const window = withinHours <= 30 ? "24 hours" : `${Math.round(withinHours / 24)} days`;

  const prompt = [
    `List the most significant TECHNOLOGY news published in the last ${window}.`,
    "",
    "Cover the whole field, not one niche: AI and models, developer tools and frameworks,",
    "runtimes and languages, cloud and infrastructure, databases, security, and hardware that",
    "developers actually use.",
    "",
    `Give up to ${maxResults} items as a numbered list. For EVERY item give exactly these four`,
    "labelled lines:",
    "  Headline: <the headline as published>",
    "  Publisher: <outlet name>",
    "  URL: <the full article URL>",
    "  Date: <publication date>",
    "",
    "Where several outlets covered one story, list each outlet as its own item — independent",
    "coverage is the point. Leave out anything you cannot give a URL for.",
  ].join("\n");

  let text: string;
  try {
    const res = await generateText({ ...aiCallDefaults(), model, system: SEARCH_SYSTEM, prompt });
    text = res.text;
  } catch (err) {
    console.warn("[news-search] search failed:", err instanceof Error ? err.message : err);
    return { items: [], stats: { returned: 0, malformed: 0, unreachable: 0, kept: 0 } };
  }

  if (!text.trim()) {
    console.warn("[news-search] search model returned nothing");
    return { items: [], stats: { returned: 0, malformed: 0, unreachable: 0, kept: 0 } };
  }

  let parsed: z.infer<typeof resultListSchema> | null = null;
  try {
    parsed = resultListSchema.parse(extractAndParseJson(text));
  } catch {
    // Expected for a chat-UI search model. Hand the prose to the formatter.
    parsed = null;
  }

  if (!parsed && opts.formatter) {
    try {
      const res = await generateText({
        ...aiCallDefaults(),
        model: opts.formatter,
        system: STRUCTURE_SYSTEM,
        prompt: `Convert this briefing into JSON:\n\n${text.slice(0, 12_000)}`,
      });
      parsed = resultListSchema.parse(extractAndParseJson(res.text));
    } catch (err) {
      console.warn(
        "[news-search] could not structure the search answer:",
        err instanceof Error ? err.message : err
      );
    }
  }

  if (!parsed) {
    console.warn(`[news-search] unreadable answer (${text.length} chars), no formatter available`);
    return { items: [], stats: { returned: 0, malformed: 1, unreachable: 0, kept: 0 } };
  }

  const returned = parsed.results.length;
  let malformed = 0;

  const candidates: { item: Omit<NewsItem, "publisher" | "group" | "primary">; publisher: string }[] = [];
  const seenUrls = new Set<string>();

  for (const r of parsed.results) {
    let host: string;
    try {
      const url = new URL(r.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
      host = url.hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      malformed++;
      continue;
    }
    if (seenUrls.has(r.url)) continue;
    seenUrls.add(r.url);

    const at = r.publishedAt ? Date.parse(r.publishedAt) : NaN;
    candidates.push({
      publisher: r.publisher,
      item: {
        title: r.headline,
        url: r.url,
        host,
        summary: "",
        publishedAt: Number.isFinite(at) ? at : null,
      },
    });
  }

  const alive = await verifyAll(candidates.map((c) => c.item.url));

  const items: NewsItem[] = [];
  for (const c of candidates) {
    if (!alive.has(c.item.url)) {
      console.warn(`[news-search] dropping unreachable citation: ${c.item.url}`);
      continue;
    }
    // The registry decides the independence key, not the model's idea of the publisher name.
    const mapped = groupForHost(c.item.host);
    items.push({
      ...c.item,
      publisher: mapped.publisher === mapped.group ? c.publisher : mapped.publisher,
      group: mapped.group,
      primary: mapped.primary,
    });
  }

  const stats = {
    returned,
    malformed,
    unreachable: candidates.length - items.length,
    kept: items.length,
  };
  console.log(
    `[news-search] ${stats.kept}/${stats.returned} hasil dipakai ` +
      `(${stats.malformed} tidak valid, ${stats.unreachable} URL tidak bisa dibuka)`
  );
  return { items, stats };
}
