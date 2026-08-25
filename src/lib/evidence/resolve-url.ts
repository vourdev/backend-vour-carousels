import { generateText, type LanguageModel } from "ai";
import { aiCallDefaults, availableModels, resolveModel } from "../ai/registry";

/**
 * Propose where the thing a screenshot brief names actually lives.
 *
 * This USED to be a grounded Google search, and the corroboration rule was "the host the
 * model names must appear in the search sources that came back with it". That is gone:
 * the grounded search quota is exhausted on the account and the only search-capable model
 * in the OmniRoute catalogue (`tllm/sonar-pro`) answers 403 insufficient_quota, so there
 * is no search to corroborate against.
 *
 * What comes out of here is therefore an UNVERIFIED CANDIDATE — a domain from a model's
 * memory, which is exactly the hallucination risk the corroboration rule existed to
 * catch. It is never accepted on its own. `verifyPageIdentity` visits each candidate and
 * proves the page is about the entity before anything is photographed, and that check is
 * what now carries the weight the search sources used to.
 *
 * Everything else survives intact: https only, no aggregators, a confidence gate, and
 * "when in doubt, no screenshot".
 */

export interface UrlCandidate {
  url: string;
  host: string;
  /** 0 is tried first: high-confidence candidates in the model's order, then the rest. */
  rank: number;
  /** The model's own certainty. Kept for the audit log, not used as a gate — see below. */
  confidence: "high" | "low";
}

export type ResolveFailure =
  | "no-model"
  | "no-answer"
  | "unparseable"
  | "not-https"
  | "aggregator"
  | "no-candidates";

export type ResolveOutcome =
  | { ok: true; candidates: UrlCandidate[] }
  | { ok: false; reason: ResolveFailure; candidate?: string };

/**
 * Hosts that can never be an entity's own site.
 *
 * These mattered more when search sources were the input — a search for a tool surfaces
 * its Reddit thread before it surfaces a wrong domain — but they matter here too: asked
 * for an official site a model will happily answer with the Wikipedia article, and that
 * page WOULD pass the identity check, because it genuinely is about the entity.
 */
const NEVER_OFFICIAL = new Set([
  "google.com", "www.google.com", "bing.com", "duckduckgo.com",
  "reddit.com", "x.com", "twitter.com", "facebook.com", "instagram.com",
  "linkedin.com", "youtube.com", "youtu.be", "tiktok.com",
  "wikipedia.org", "en.wikipedia.org", "id.wikipedia.org", "medium.com", "dev.to",
  "substack.com", "news.ycombinator.com", "stackoverflow.com", "quora.com",
  "producthunt.com", "g2.com", "capterra.com", "slashdot.org",
]);

/** Apex form of a host, so `www.opencode.ai` and `opencode.ai` compare equal. */
export function apex(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

function hostOf(value: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseAnswer(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const open = cleaned.indexOf("{");
  const close = cleaned.lastIndexOf("}");
  if (open === -1 || close <= open) return null;
  try {
    return JSON.parse(cleaned.slice(open, close + 1));
  } catch {
    return null;
  }
}

const PROMPT = (entity: string) => `Which website is the OFFICIAL home of this: "${entity}"?

You have no web access, so this is a memory question.

Rules:
- Official means the project's or company's own site — never Wikipedia, Reddit, a package
  registry, a news article or a directory listing.
- Give up to 3 candidates, best first.
- Mark "high" only for a domain you have actually seen. Mark "low" for a best guess.
- A guess IS useful: every candidate is opened and checked against the page's own title
  before anything is used, so a wrong one is discarded safely. An empty list means no
  screenshot at all, so only answer with an empty list when you have no idea whatsoever.

Reply with ONLY this JSON:
{"candidates": [{"url": "https://example.com", "confidence": "high" | "low"}]}`;

/**
 * The model behind the proposal.
 *
 * `vour-high` rather than the lite combo: this is a recall question — does the model know
 * this project's domain — and the cheaper combo answers "yes" more often than it knows.
 * A wrong candidate is not dangerous any more (the identity check will drop it), but it
 * costs a page load, so the better guesser is still worth one call.
 */
function defaultProposer(): LanguageModel | null {
  // `resolveModel` builds a client for an unconfigured provider quite happily and only
  // fails at call time with "Invalid URL", which would be logged as a lookup failure
  // rather than as "no model configured". Ask what is actually available instead.
  if (!availableModels().includes("vour-high")) return null;
  return resolveModel("vour-high");
}

export async function proposeOfficialUrls(
  entity: string,
  model?: LanguageModel | null
): Promise<ResolveOutcome> {
  // `null` means "explicitly none"; `undefined` means "use the default".
  const llm = model === undefined ? defaultProposer() : model;
  if (!llm) return { ok: false, reason: "no-model" };

  let text: string;
  try {
    const res = await generateText({ model: llm, prompt: PROMPT(entity), ...aiCallDefaults() });
    text = res.text.trim();
  } catch (err) {
    console.warn(`[web-evidence] candidate lookup failed for "${entity}":`, err);
    return { ok: false, reason: "no-answer" };
  }
  if (!text) return { ok: false, reason: "no-answer" };

  const answer = parseAnswer(text);
  const raw: any[] = Array.isArray(answer?.candidates)
    ? answer.candidates
    : // A model that ignored the array shape and answered the older single-object form.
      answer?.url
      ? [answer]
      : [];
  if (!answer) return { ok: false, reason: "unparseable" };
  if (!raw.length) return { ok: false, reason: "no-candidates" };

  /**
   * Confidence orders the queue; it no longer vetoes.
   *
   * It used to drop anything not marked "high", which was right when a grounded search
   * stood behind the answer: "low" meant the model was reconstructing a domain rather
   * than reading one, and nothing downstream could tell the difference. Now something
   * can. `verifyPageIdentity` opens every candidate before a single pixel is captured, so
   * a bad guess costs one page load and is thrown away, while dropping it outright costs
   * the slide its screenshot. Measured on the real thing: asked about OpenCode, the combo
   * answers `opencode.dev`, which does not resolve — and `opencode.ai`, the real site,
   * only ever arrives as a second guess.
   */
  const high: UrlCandidate[] = [];
  const low: UrlCandidate[] = [];
  let lastRejection: { reason: ResolveFailure; candidate: string } | null = null;

  for (const item of raw) {
    const url = String(item?.url ?? "").trim();
    if (!url) continue;

    if (!/^https:\/\//i.test(url)) {
      // http:// is not upgraded silently: a site that cannot serve TLS is not one we want
      // to photograph as evidence, and the downgrade would be invisible.
      lastRejection = { reason: "not-https", candidate: url };
      continue;
    }
    const host = hostOf(url);
    if (!host) {
      lastRejection = { reason: "unparseable", candidate: url };
      continue;
    }
    if (NEVER_OFFICIAL.has(apex(host))) {
      lastRejection = { reason: "aggregator", candidate: url };
      continue;
    }
    if ([...high, ...low].some((c) => c.host === apex(host))) continue;

    const confidence = String(item?.confidence ?? "").toLowerCase() === "high" ? "high" : "low";
    (confidence === "high" ? high : low).push({ url, host: apex(host), rank: 0, confidence });
  }

  const candidates = [...high, ...low].slice(0, 3).map((c, rank) => ({ ...c, rank }));

  if (!candidates.length) {
    return lastRejection
      ? { ok: false, reason: lastRejection.reason, candidate: lastRejection.candidate }
      : { ok: false, reason: "no-candidates" };
  }
  return { ok: true, candidates };
}
