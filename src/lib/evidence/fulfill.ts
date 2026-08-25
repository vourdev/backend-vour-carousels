import type { Browser } from "playwright";
import type { SlidePlan } from "../ds/schema";
import type { LanguageModel } from "ai";
import { proposeOfficialUrls, type UrlCandidate } from "./resolve-url";
import { verifyPageIdentity, type IdentityVerdict } from "./verify-identity";
import { captureWebEvidence, launchEvidenceBrowser, type WebEvidenceShot } from "./capture-web";
import { validateEvidenceShot, type ShotVerdict } from "./validate";
import { logEvidenceAttempt, type EvidenceAttempt } from "./log";

/**
 * Fill in `screenshot` evidence automatically, for whichever path asked.
 *
 * One function, two callers — /automation/generate and /api/plan — because the rule this
 * encodes must not be able to differ between the cron and the wizard. The alternative was
 * the shape buildPostText was rescued from: the same logic written twice, drifting until
 * one copy shipped something the other would have refused.
 *
 * The rule is now two independent gates, and a candidate has to pass both:
 *
 *   1. `proposeOfficialUrls` asks a model for up to three domains it remembers, and drops
 *      anything that is http, an aggregator, or offered with low confidence. What
 *      survives is a CANDIDATE, never an answer — there is no web search behind it.
 *   2. `verifyPageIdentity` opens each candidate and checks the page's own title, meta
 *      description and heading against the entity. Only a page that says it is the thing
 *      gets photographed.
 *
 * Gate 2 is what makes gate 1 safe to trust, and it is deliberately independent of it: it
 * would catch a bad URL from a search-grounded model, from a plain one, or from a human
 * typing it in.
 *
 * What this does NOT do is choose the fallback. A slide it could not satisfy is left
 * exactly as it arrived — still `pending` — and each path then applies the policy it
 * already had: the cron replaces it with an illustration (`stripUnfulfillableEvidence`),
 * the wizard keeps the "BUTUH SCREENSHOT ASLI" card and its upload form, where a human
 * being present is the whole point.
 */
export interface FulfillOptions {
  /** Recorded on every audit row so the two callers can be told apart. */
  path: "automation" | "user";
  /** Ceiling on captures per deck. Two screenshot slides is already an unusual deck. */
  maxSlides?: number;
  /* Seams for tests — production passes none of these. */
  /** Model that proposes candidate domains. */
  proposer?: LanguageModel | null;
  /** Model that breaks a tie when token overlap is ambiguous. */
  judge?: LanguageModel | null;
  propose?: (entity: string) => Promise<Awaited<ReturnType<typeof proposeOfficialUrls>>>;
  verify?: (browser: Browser, url: string, entity: string) => Promise<IdentityVerdict>;
  browserFactory?: () => Promise<Browser>;
  capture?: (browser: Browser, url: string, instruction?: string, opts?: { cropRatio?: string }) => Promise<WebEvidenceShot>;
  validate?: (browser: Browser, buffer: Buffer) => Promise<ShotVerdict>;
}

export interface FulfillResult {
  plan: SlidePlan;
  attempts: EvidenceAttempt[];
}

const DEFAULT_MAX_SLIDES = 2;

function isPendingScreenshot(slide: any): boolean {
  return (
    slide?.role === "point" &&
    slide?.mockup?.type === "screenshot" &&
    !(slide.mockup.evidenceStatus === "captured" && slide.mockup.screenshotImage?.dataUrl)
  );
}

/** Fail-safe wrapper: a site that hangs past the budget is a site we do not use. */
function withBudget<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms)),
  ]);
}


/**
 * Walk the candidates in the model's own order, and stop at the first that survives both
 * gates. Everything before it is reported by the reason it fell over, so the audit log
 * distinguishes "the domain was wrong" from "the site was down" from "the picture was
 * blank" — three different things to fix.
 */
async function tryCandidates(args: {
  browser: Browser;
  candidates: UrlCandidate[];
  entity: string;
  instruction?: string;
  cropRatio?: string;
  verify: (browser: Browser, url: string, entity: string) => Promise<IdentityVerdict>;
  capture: (browser: Browser, url: string, instruction?: string, opts?: { cropRatio?: string }) => Promise<WebEvidenceShot>;
  validate: (browser: Browser, buffer: Buffer) => Promise<ShotVerdict>;
}): Promise<{
  shot?: WebEvidenceShot;
  outcome: "skipped" | "rejected" | "error";
  reason?: string;
  host?: string;
  url?: string;
  metrics?: Record<string, unknown>;
  identity?: { method: string; score: number; title?: string };
}> {
  let last: {
    outcome: "skipped" | "rejected" | "error";
    reason?: string;
    host?: string;
    url?: string;
    metrics?: Record<string, unknown>;
  } = {
    outcome: "skipped",
    reason: "no-candidates",
  };

  for (const candidate of args.candidates) {
    // Gate 2, before any pixels are spent: is this page even about the entity?
    const identity = await args.verify(args.browser, candidate.url, args.entity);
    if (!identity.ok) {
      last = {
        outcome: "skipped",
        reason: identity.method === "unreachable" ? "unreachable" : "identity-mismatch",
        host: candidate.host,
        url: candidate.url,
        metrics: {
          identityMethod: identity.method,
          identityScore: identity.score,
          matched: identity.matched,
          title: identity.signals?.title,
          detail: identity.reason,
        },
      };
      continue;
    }

    const shot = await args.capture(args.browser, candidate.url, args.instruction, {
      cropRatio: args.cropRatio,
    }).catch((err) => {
      // The site was the right one and would not be photographed — a dead page, a
      // timeout, a 404. Recorded as an error rather than a skip, because it is the site
      // that failed and not a decision we made, and the next candidate still gets a turn.
      last = {
        outcome: "error",
        reason: err instanceof Error ? err.message : String(err),
        host: candidate.host,
        url: candidate.url,
      };
      return null;
    });
    if (!shot) continue;

    const verdict = await args.validate(args.browser, shot.buffer);
    if (!verdict.ok) {
      last = {
        outcome: "rejected",
        reason: verdict.reason,
        host: candidate.host,
        url: candidate.url,
        metrics: { ...verdict.metrics },
      };
      continue;
    }

    return {
      shot,
      outcome: "rejected", // unused on the success path; `shot` is what the caller reads

      host: candidate.host,
      url: candidate.url,
      metrics: { ...verdict.metrics },
      identity: { method: identity.method, score: identity.score, title: identity.signals?.title },
    };
  }

  return last;
}

export async function fulfillWebEvidence(plan: SlidePlan, opts: FulfillOptions): Promise<FulfillResult> {
  const targets = plan.slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide }) => isPendingScreenshot(slide));

  // The overwhelmingly common deck has no screenshot slide at all. It must cost nothing:
  // no browser, no search call, no audit row, and the very same plan object back.
  if (!targets.length) return { plan, attempts: [] };

  const propose = opts.propose ?? ((entity: string) => proposeOfficialUrls(entity, opts.proposer));
  const verify =
    opts.verify ??
    ((browser: Browser, url: string, entity: string) =>
      verifyPageIdentity(browser, url, entity, { judge: opts.judge }));
  const capture = opts.capture ?? captureWebEvidence;
  const validate = opts.validate ?? validateEvidenceShot;
  const maxSlides = opts.maxSlides ?? DEFAULT_MAX_SLIDES;

  const slides = [...plan.slides];
  const attempts: EvidenceAttempt[] = [];
  let browser: Browser | null = null;

  try {
    for (const { slide, index } of targets.slice(0, maxSlides)) {
      const started = Date.now();
      const mockup = (slide as any).mockup;
      const brief = mockup.screenshotBrief;
      const entity = entityOf(slide);
      const record = (partial: Omit<EvidenceAttempt, "path" | "entity" | "durationMs" | "slideIndex">) => {
        const attempt: EvidenceAttempt = {
          path: opts.path,
          entity,
          slideIndex: index,
          durationMs: Date.now() - started,
          ...partial,
        };
        attempts.push(attempt);
        return logEvidenceAttempt(attempt);
      };

      const proposal = await propose(entity);
      if (!proposal.ok) {
        // Nothing worth opening a browser for.
        await record({ outcome: "skipped", reason: proposal.reason, url: proposal.candidate });
        continue;
      }

      try {
        if (!browser) browser = await (opts.browserFactory ?? launchEvidenceBrowser)();

        const outcome = await tryCandidates({
          browser,
          candidates: proposal.candidates,
          entity,
          instruction: brief?.mustShow,
          cropRatio: brief?.cropRatio,
          verify,
          capture,
          validate,
        });

        if (!outcome.shot) {
          await record({
            outcome: outcome.outcome,
            reason: outcome.reason,
            host: outcome.host,
            url: outcome.url,
            metrics: outcome.metrics,
          });
          continue;
        }

        // Inline base64, never a URL: the final capture of the deck runs offline, so an
        // <img src="https://…"> here would be an empty box in the exported PNG.
        slides[index] = {
          ...(slide as any),
          mockup: {
            ...mockup,
            evidenceStatus: "captured",
            screenshotImage: {
              dataUrl: `data:image/jpeg;base64,${outcome.shot.buffer.toString("base64")}`,
              uploadedAt: new Date().toISOString(),
            },
          },
        } as any;

        await record({
          outcome: "captured",
          host: outcome.host,
          url: outcome.shot.meta.finalUrl,
          metrics: { ...outcome.metrics, ...outcome.shot.meta, identity: outcome.identity },
        });
      } catch (err) {
        await record({
          outcome: "error",
          reason: err instanceof Error ? err.message : String(err),
          host: proposal.candidates[0]?.host,
          url: proposal.candidates[0]?.url,
        });
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return { plan: { ...plan, slides }, attempts };
}

/**
 * What to look up.
 *
 * `screenshotBrief.source` is the model's own description of the thing it wants a picture
 * of ("OpenCode homepage", "Postgres EXPLAIN docs"), which is exactly a search query. The
 * headline is the fallback for a brief-less slide, and is far weaker — most of those end
 * up unresolved, which is the correct outcome rather than a guessed domain.
 */
function entityOf(slide: any): string {
  const source = slide?.mockup?.screenshotBrief?.source;
  if (typeof source === "string" && source.trim()) return source.trim();
  return String(slide?.headline ?? "").trim() || "unknown";
}
