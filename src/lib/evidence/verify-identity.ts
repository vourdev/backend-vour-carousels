import type { Browser } from "playwright";
import { generateText, type LanguageModel } from "ai";
import { aiCallDefaults, availableModels, resolveModel } from "../ai/registry";
import { apex } from "./resolve-url";

/**
 * Prove the page really is the thing the brief asked for, before it is photographed.
 *
 * This is the layer that replaced grounded-search corroboration, and it is stronger in
 * the way that matters: a search citation only proves a domain was mentioned somewhere,
 * while this proves the page that is about to be captured says it is about this entity.
 *
 * It runs for EVERY candidate regardless of where the candidate came from — a
 * search-capable model, a plain one, or a URL somebody typed. Defence in depth means the
 * layer below does not get to assume the layer above was right.
 *
 * Two stages, cheap first. Token overlap between the entity and what the page says about
 * itself decides the clear cases at no cost; only genuinely ambiguous ones spend a small
 * model call. A page with zero overlap is rejected outright and never reaches the model:
 * `example.com` for "OpenCode homepage" is not a judgement call.
 */

export interface IdentitySignals {
  finalUrl: string;
  host: string;
  title: string;
  description: string;
  siteName: string;
  heading: string;
}

export type IdentityMethod = "tokens" | "llm" | "no-overlap" | "unreachable";

export interface IdentityVerdict {
  ok: boolean;
  method: IdentityMethod;
  score: number;
  matched: string[];
  signals?: IdentitySignals;
  reason?: string;
}

/**
 * Words that describe the SHAPE of the request rather than the thing itself.
 *
 * `screenshotBrief.source` is written for a human — "OpenCode homepage", "halaman harga
 * Vercel" — so without this the entity tokens are half filler and any page with the word
 * "home" in its title scores a match.
 */
const GENERIC = new Set([
  "homepage", "home", "page", "pages", "website", "site", "web", "official", "the", "a", "an",
  "screenshot", "screen", "shot", "dashboard", "docs", "doc", "documentation", "landing",
  "halaman", "situs", "resmi", "utama", "beranda", "tangkapan", "layar", "dari", "untuk",
  "app", "application", "tool", "platform", "service", "product", "of", "for", "and", "or",
]);

/** Entity words worth matching on, longest first — the longest is the most distinctive. */
export function entityTokens(entity: string): string[] {
  const seen = new Set<string>();
  return entity
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !GENERIC.has(t))
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
    .sort((a, b) => b.length - a.length);
}

/**
 * How much of the entity the page's own words account for.
 *
 * The host is part of the haystack with its dots stripped, so "opencode.ai" matches the
 * token "opencode" — a project whose site is its name is the common case and it should
 * not need the title to spell it out.
 */
export function scoreIdentity(
  entity: string,
  signals: Pick<IdentitySignals, "host" | "title" | "description" | "siteName" | "heading">
): { score: number; matched: string[]; primaryMatched: boolean; tokens: string[] } {
  const tokens = entityTokens(entity);
  if (!tokens.length) return { score: 0, matched: [], primaryMatched: false, tokens };

  const haystack = [
    apex(signals.host).replace(/[.\-_]/g, ""),
    apex(signals.host),
    signals.title,
    signals.description,
    signals.siteName,
    signals.heading,
  ]
    .join(" ")
    .toLowerCase();

  const matched = tokens.filter((t) => haystack.includes(t));
  return {
    score: matched.length / tokens.length,
    matched,
    // tokens[0] is the longest, i.e. the one least likely to appear by chance.
    primaryMatched: matched.includes(tokens[0]),
    tokens,
  };
}

/** What a page says about itself. Cheap: DOM only, no settle, no screenshot. */
const READ_SIGNALS = `(() => {
  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };
  const h1 = document.querySelector("h1");
  return {
    title: (document.title || "").trim(),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    siteName: meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]'),
    heading: h1 ? (h1.textContent || "").trim().slice(0, 200) : "",
  };
})()`;

export async function readIdentitySignals(browser: Browser, url: string): Promise<IdentitySignals> {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const status = response?.status() ?? 0;
    if (!response) throw new Error(`no response from ${url}`);
    if (status >= 400) throw new Error(`HTTP ${status} from ${url}`);

    const read = await page.evaluate<{
      title: string;
      description: string;
      siteName: string;
      heading: string;
    }>(READ_SIGNALS);

    const finalUrl = page.url();
    return {
      finalUrl,
      // The host AFTER redirects: a parked domain that bounces to a registrar is a
      // different site from the one the model named, and this is where that shows up.
      host: new URL(finalUrl).hostname.toLowerCase(),
      ...read,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

const JUDGE_PROMPT = (entity: string, s: IdentitySignals) =>
  `Is this web page the official home of "${entity}"?

Page host: ${s.host}
Page title: ${s.title || "(none)"}
Site name: ${s.siteName || "(none)"}
Description: ${s.description || "(none)"}
Main heading: ${s.heading || "(none)"}

Answer "yes" only if the page is clearly about that exact thing — same product, same
project, same company. A page about something else with a similar name is "no". A generic
placeholder, parked domain, login wall or error page is "no".

Reply with ONLY this JSON: {"match": true | false}`;

function defaultJudge(): LanguageModel | null {
  // This asked for the cheap combo, `vour-lite`, on the grounds that a yes/no about text
  // already in front of the model is not a recall question. Sound reasoning, dead combo:
  // `vour-lite` pointed at `vour-learning`, which OmniRoute does not have, so every tie-break
  // threw and the verdict below fell through to "identity judge unavailable" — failing closed,
  // as designed, but on a configuration error rather than on the evidence. Screenshots that
  // needed the tie-break were silently dropped.
  if (!availableModels().includes("vour-high")) return null;
  return resolveModel("vour-high");
}

/** Above this the tokens alone decide. */
const TOKEN_ACCEPT = 0.5;

export async function verifyPageIdentity(
  browser: Browser,
  url: string,
  entity: string,
  opts: { judge?: LanguageModel | null; signals?: IdentitySignals } = {}
): Promise<IdentityVerdict> {
  let signals: IdentitySignals;
  try {
    signals = opts.signals ?? (await readIdentitySignals(browser, url));
  } catch (err) {
    return {
      ok: false,
      method: "unreachable",
      score: 0,
      matched: [],
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const { score, matched, primaryMatched } = scoreIdentity(entity, signals);

  if (score >= TOKEN_ACCEPT && primaryMatched) {
    return { ok: true, method: "tokens", score, matched, signals };
  }
  if (score === 0) {
    // Nothing about this page mentions anything about the entity. No model needed.
    return {
      ok: false,
      method: "no-overlap",
      score,
      matched,
      signals,
      reason: `page "${signals.title || signals.host}" says nothing about "${entity}"`,
    };
  }

  const judge = opts.judge === undefined ? defaultJudge() : opts.judge;
  if (!judge) {
    // No model to break the tie. Partial overlap is not evidence, so it fails closed.
    return {
      ok: false,
      method: "tokens",
      score,
      matched,
      signals,
      reason: "partial match and no model available to confirm it",
    };
  }

  try {
    const res = await generateText({
      model: judge,
      prompt: JUDGE_PROMPT(entity, signals),
      ...aiCallDefaults(),
    });
    const match = /"match"\s*:\s*true/i.test(res.text) || /^\s*yes\b/i.test(res.text.trim());
    return {
      ok: match,
      method: "llm",
      score,
      matched,
      signals,
      reason: match ? undefined : `model says this page is not "${entity}"`,
    };
  } catch (err) {
    console.warn(`[web-evidence] identity judge failed for ${url}:`, err);
    return {
      ok: false,
      method: "llm",
      score,
      matched,
      signals,
      reason: "identity judge unavailable",
    };
  }
}
