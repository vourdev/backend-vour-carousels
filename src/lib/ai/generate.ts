import { generateText, generateObject, type LanguageModel } from "ai";
import { supportsStructuredOutput, aiCallDefaults } from "./registry";
import { z } from "zod";
import { slidePlanSchema, slideSchema, type SlidePlan } from "../ds/schema";
import { repairSlide, repairSlidePlan } from "../ds/repair";
import { resolveLayout } from "../ds/render-slide";
import { normalizeIllustration } from "../ds/illustrations";
import {
  assertScopePreserved,
  mergeScopedRevision,
  parseRevisionScope,
  scopeFromClassifier,
  scopedChangeSummary,
  type RevisionScope,
  type ScopedPatch,
} from "../ai/revision-scope";
import {
  briefSystem,
  briefUserPrompt,
  planSystem,
  planUserPrompt,
  reviseSystem,
  reviseUserPrompt,
  scopeClassifierSystem,
  scopeClassifierPrompt,
  scopedSlideReviseSystem,
  scopedSlideRevisePrompt,
  scopedGlobalReviseSystem,
  scopedGlobalRevisePrompt,
  humanVoiceEditorSystem,
  humanVoiceEditorUserPrompt,
} from "../ai/prompts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True once the AI SDK has already exhausted its own transport retries.
 *
 * `generateText`/`generateObject` retry failed HTTP calls internally — three
 * attempts with exponential backoff, honouring `Retry-After`. This wrapper
 * exists for a different class of failure: a model that answers but returns
 * unparseable JSON or a plan that fails schema validation, which the SDK never
 * retries. Keeping the two layers separate matters, because retrying on top of
 * an exhausted SDK turns 3 attempts into 9 and triples the time before the
 * caller sees the identical error — long enough to blow past the proxy timeout
 * and surface as a 504 instead of the real cause.
 */
export function isSdkRetryExhausted(err: any): boolean {
  return err?.name === "AI_RetryError" || err?.constructor?.name === "RetryError";
}

/**
 * OmniRoute answering "your request waited in my queue until the budget ran out".
 *
 *   [502] Request dropped after exceeding the local rate-limit queue budget
 *   maxWaitMs (120000ms) for agy/gemini-3.5-flash-high
 *
 * This is not a slow provider and not a dead link — it is back-pressure, and the one
 * response that makes it worse is an immediate retry, which books another 120-second slot
 * in the queue that just overflowed. Backing off for longer than a normal transport blip
 * is the only retry that has a chance of finding room.
 */
export function isQueueSaturation(err: any): boolean {
  const haystack = `${err?.message ?? ""} ${err?.responseBody ?? ""} ${err?.cause?.message ?? ""}`;
  return /queue budget|maxWaitMs|requestQueue/i.test(haystack);
}

/**
 * OmniRoute answering "I had nothing to dispatch to".
 *
 *   [503] Service temporarily unavailable: all targets were skipped by pre-dispatch filters
 *   {"code":"ALL_TARGETS_SKIPPED","diagnostics":{"poolSize":4,"attempted":0,...}}
 *
 * `attempted: 0` is the tell — no provider was even contacted, so nothing about the request
 * is at fault and re-asking changes nothing until the pool reopens. On 23 Sep 2026 the VPS
 * uplink blipped, OmniRoute misread `fetch failed` as a rate limit and cooled down all five
 * antigravity accounts for 5s, and this retry ladder (2.5s, 5s) spent its last attempt
 * 2 seconds before the cooldown expired. The nightly produced nothing on either domain.
 */
export function isNoTargetAvailable(err: any): boolean {
  const haystack = `${err?.message ?? ""} ${err?.responseBody ?? ""} ${err?.cause?.message ?? ""}`;
  return /ALL_TARGETS_SKIPPED|all targets were skipped|no_targets|all_targets_skipped/i.test(haystack);
}

/**
 * The only place an AI call is retried.
 *
 * The transport used to retry too (`maxRetries` defaults to 2), so a single user action
 * arrived at OmniRoute as three requests. That layer is off now — see `aiCallDefaults` in
 * lib/ai/registry.ts — which leaves this as the sole authority: three attempts, spaced,
 * each one passing through the concurrency gate like any other request.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`AI call attempt ${i + 1} failed:`, err);
      lastError = err;

      // Only reachable when OMNIROUTE_SDK_RETRIES has been raised back above zero: the
      // transport had its shots, so rethrow untouched and keep the message single-level.
      if (isSdkRetryExhausted(err)) throw err;

      if (i < attempts - 1) {
        // 2.5s, 5s for an ordinary failure. Saturation gets 20s, 40s instead — the queue
        // needs time to drain, and coming back in two and a half seconds just rejoins it.
        // An empty pool gets longer still: a provider cooldown outlives both ladders, and
        // the request that finds the door shut has nothing to gain from knocking sooner.
        const noTarget = isNoTargetAvailable(err);
        const saturated = !noTarget && isQueueSaturation(err);
        if (noTarget) console.warn("[omniroute] no dispatchable target, waiting for the pool to reopen");
        if (saturated) console.warn("[omniroute] queue saturated, backing off before retry");
        // 60s then 180s for an empty pool. The 23 Sep egress outage lasted about eleven
        // minutes; four is not all of it, but the n8n carousel node waits 1800s and a dead
        // pool fails on the first call, so only one call ever pays this wait.
        const step = saturated ? 20_000 : 2500;
        await delay(noTarget ? (i === 0 ? 60_000 : 180_000) : (i + 1) * step);
      }
    }
  }
  
  let extraInfo = "";
  if (lastError?.responseBody) {
    const bodyStr = String(lastError.responseBody).trim();
    extraInfo = ` (Response: ${bodyStr.substring(0, 250)})`;
  } else if (lastError?.cause) {
    extraInfo = ` (Cause: ${lastError.cause?.message || String(lastError.cause)})`;
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed after ${attempts} attempts. Last error: ${msg}${extraInfo}`);
}

/**
 * Repair the ways an LLM breaks JSON, without touching JSON that is already valid.
 *
 * Only reached after a strict parse has failed, so healthy output pays nothing. The three
 * faults here are the ones actually observed from this provider, in one pass over the
 * text that tracks whether it is inside a string literal:
 *
 *  - a raw newline or tab inside a string. JSON forbids literal control characters there,
 *    and a model writing multi-line copy emits them constantly.
 *  - a trailing comma before } or ], which every model does eventually.
 *  - truncation. The response simply stops, leaving an unterminated string and unclosed
 *    braces. Closing them yields the complete part of the answer instead of none of it.
 *
 * A revision that dies on a comma is a revision the user has to ask for twice, and the
 * second attempt costs another model call on a link that is already the slow part.
 */
/**
 * True when the last meaningful character ended a value and the next one starts another,
 * which means the comma between them is missing. Deliberately narrow: only a closed
 * bracket or a closed string counts, so this cannot fire between a key and its value.
 */
function needsSeparator(out: string): boolean {
  const prev = out.replace(/\s+$/, "").slice(-1);
  return prev === "}" || prev === "]" || prev === '"';
}

function salvageJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      // Literal control characters are illegal inside a JSON string; escape rather
      // than drop, so the copy the model wrote survives intact.
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
      continue;
    }

    if (ch === '"') {
      // A quote opening a new value straight after a finished one: the separator was
      // dropped. Observed as `Expected ',' or ']' after array element`.
      if (needsSeparator(out)) out += ",";
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "{" || ch === "[") {
      if (needsSeparator(out)) out += ",";
      stack.push(ch);
      out += ch;
      continue;
    }
    if (ch === "}" || ch === "]") { stack.pop(); out += ch; continue; }
    out += ch;
  }

  if (inString) out += '"';
  // Drop a trailing comma (and any whitespace after it) before closing.
  out = out.replace(/,(\s*)$/, "$1");
  while (stack.length) out += stack.pop() === "{" ? "}" : "]";
  // Trailing commas anywhere else.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function extractAndParseJson(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else if (firstBrace !== -1) {
    // No closing brace at all: the response was cut off. Keep what arrived.
    cleaned = cleaned.substring(firstBrace);
  }

  try {
    return JSON.parse(cleaned);
  } catch (strict) {
    const salvaged = salvageJson(cleaned);
    try {
      const value = JSON.parse(salvaged);
      console.warn("[json] model returned malformed JSON; salvaged it rather than losing the turn.");
      return value;
    } catch {
      // Report the original fault, not the salvage attempt's — the first one says what
      // the model actually got wrong.
      throw strict;
    }
  }
}

export async function generateBrief(idea: string, model: LanguageModel): Promise<string> {
  return withRetry(async () => {
    const { text } = await generateText({
      model,
      system: briefSystem,
      prompt: briefUserPrompt(idea),
      ...aiCallDefaults(),
    });
    return text;
  });
}

/**
 * Analogy keywords that trigger the illustration safety net.
 * If a point slide's body contains any of these words but the model chose
 * a non-illustration mockup, we override it here — no re-generation needed.
 */
const ANALOGY_PATTERN = /\b(kayak|ibarat|mirip|bayangkan|seperti)\b/i;

/**
 * Mockups whose presence means the illustration rule does not apply to this slide.
 *
 * The prompt states two exclusions before it mandates an illustration: the slide must not
 * be showing code/command/terminal output, and must not be explicitly comparing two or
 * more things. The safety net enforces the rule, so it has to honour the same exclusions —
 * without them a `comparison` whose body happened to contain "mirip" was replaced by a
 * stock drawing, which is not the rule being enforced, it is the rule being exceeded.
 */
const NOT_AN_ANALOGY_SLIDE = new Set([
  // shows code, a command, or program output
  "terminal", "commandlist", "commandpalette", "promptcard", "config", "apirequest", "foldertree",
  // explicitly weighs two or more things against each other
  "comparison", "datatable", "timeline", "decision", "latencycomp",
]);

/**
 * Slugs the safety net falls back on, alternating by slide index.
 *
 * There is no way to choose one semantically from here — that is the model's job, and the
 * net only runs because the model did not do it. Alternating at least stops two overridden
 * slides in the same deck from showing the identical stock drawing.
 */
const ILLUSTRATION_FALLBACK_SLUGS = ["online-learning_tgmv", "learning_qt7d", "knowledge_0ty5"];
const ILLUSTRATION_FALLBACK_SLUG = ILLUSTRATION_FALLBACK_SLUGS[0];

/**
 * Post-processing pass: enforce illustration mockup for any point slide
 * whose body text signals an analogy/metaphor but the model picked something
 * else. This is a code-level safety net that does not rely on model compliance.
 */
function enforceIllustrationForAnalogySlides(plan: SlidePlan): SlidePlan {
  const slides = plan.slides.map((slide, i) => {
    if (slide.role !== "point") return slide;
    // Word boundaries, not substring: "kayaknya" and "miripnya" are ordinary prose, and
    // matching them as analogy markers overrode slides that were never analogies.
    if (!ANALOGY_PATTERN.test(slide.body ?? "")) return slide;
    if (slide.mockup?.type === "illustration") return slide;
    if (slide.mockup && NOT_AN_ANALOGY_SLIDE.has(slide.mockup.type)) return slide;
    // Override: the slide uses analogy language but got a technical mockup
    console.warn(
      `[illustration-safety-net] Slide "${slide.eyebrow}" has analogy keywords but mockup="${slide.mockup?.type ?? "none"}". Overriding to illustration.`
    );
    return {
      ...slide,
      mockup: {
        type: "illustration" as const,
        illustrationSlugs: [
          normalizeIllustration(
            ILLUSTRATION_FALLBACK_SLUGS[i % ILLUSTRATION_FALLBACK_SLUGS.length]
          ),
        ],
      },
    };
  });
  return { ...plan, slides };
}

/**
 * Every point slide leaves here with a mockup.
 *
 * `mockup` is optional in the schema and the prompt only *asks* for it, so a plan with a
 * bare point slide validates cleanly and nothing downstream notices. The renderer used to
 * hide that by fabricating a card from the slide's own body text — a slide that said the
 * same sentence twice. That fallback is gone (see resolveMockup), which leaves the real
 * problem exposed: the bottom half of a 1350px slide is empty because the plan was
 * incomplete.
 *
 * It is closed here rather than in the renderer because this is the last point where a
 * slide can be given something real instead of a copy of itself. An illustration is a
 * picture, not a claim: choosing one in code invents no content the model did not write,
 * which is exactly what the old card fallback did wrong.
 *
 * Generation only — deliberately NOT applied on revision, where the scope guard treats a
 * field appearing on an out-of-scope slide as drift and rejects the whole patch.
 */
function enforceMockupForPointSlides(plan: SlidePlan): SlidePlan {
  const slides = plan.slides.map((slide) => {
    if (slide.role !== "point" || slide.mockup || slide.card) return slide;
    console.warn(
      `[mockup-safety-net] Slide "${slide.eyebrow}" came back with no mockup. Filling with an illustration.`
    );
    return {
      ...slide,
      mockup: {
        type: "illustration" as const,
        illustrationSlugs: [normalizeIllustration(ILLUSTRATION_FALLBACK_SLUG)],
      },
    };
  });
  return { ...plan, slides };
}

/**
 * No two consecutive point slides share a composition.
 *
 * The renderer already guarantees this for slides that name no layout — it alternates by
 * index. It cannot guarantee it for slides that DO name one, because an explicit choice
 * wins, and measuring 7 generated decks showed the model naming the same layout twice in a
 * row in 5 of them despite the prompt forbidding it. Resolving the whole sequence here,
 * with the renderer's own rules, is the only place the neighbour is visible.
 *
 * Runs after enforceMockupForPointSlides, because every branch below assumes the slide has
 * a mockup to compose around.
 */
function enforceLayoutVariety(plan: SlidePlan): SlidePlan {
  let previous: string | undefined;
  const slides = plan.slides.map((slide, i) => {
    if (slide.role !== "point") return slide;

    let layout = resolveLayout(slide.layout, i, slide.mockup);
    if (layout === previous) {
      // Second chance: whatever the renderer would have picked on its own for this index.
      const rotated = resolveLayout(undefined, i, slide.mockup);
      layout =
        rotated !== previous
          ? rotated
          : // Both collide, so take the one alternative that always applies once a
            // mockup exists. standard and mockup-forward are never both unavailable.
            previous === "mockup-forward"
            ? "standard"
            : "mockup-forward";
    }
    previous = layout;
    return { ...slide, layout };
  });
  return { ...plan, slides };
}

/** Every code-level safety net, in the order they must run. */
function enforcePlanInvariants(plan: SlidePlan): SlidePlan {
  return enforceLayoutVariety(
    enforceMockupForPointSlides(enforceIllustrationForAnalogySlides(plan))
  );
}

/**
 * Drop evidence mockups that nobody is going to fill in.
 *
 * A `screenshot` mockup with no captured image renders a "⚠️ BUTUH SCREENSHOT ASLI"
 * placeholder card — a brief addressed to a human, telling them which screenshot to go
 * and take. In the wizard that is exactly right: the human is sitting there. In the daily
 * cron there is no human anywhere in the run, so the placeholder is captured, uploaded to
 * Cloudinary and scheduled to Instagram and TikTok as if it were finished artwork.
 *
 * Applied only on the unattended path, and deliberately not inside enforcePlanInvariants:
 * on the interactive path the placeholder is the feature.
 */
export function stripUnfulfillableEvidence(plan: SlidePlan): SlidePlan {
  const slides = plan.slides.map((slide) => {
    if (slide.role !== "point" || slide.mockup?.type !== "screenshot") return slide;
    if (slide.mockup.evidenceStatus === "captured" && slide.mockup.screenshotImage?.dataUrl) {
      return slide;
    }
    console.warn(
      `[evidence-guard] Slide "${slide.eyebrow}" wants a screenshot nobody can upload on this path. Replacing with an illustration.`
    );
    return {
      ...slide,
      mockup: {
        type: "illustration" as const,
        illustrationSlugs: [normalizeIllustration(ILLUSTRATION_FALLBACK_SLUG)],
      },
    };
  });
  return { ...plan, slides };
}

/**
 * One-liner use-case descriptions for each mockup type — appended to the underused
 * prompt injection so the LLM knows WHEN to use each type, not just its name.
 * Without these, the model skips types it's unsure about.
 */
const MOCKUP_USE_CASE: Record<string, string> = {
  card: "general info card for conceptual explanations",
  terminal: "code snippets, CLI output, config files, JSON",
  comparison: "before/after, bad vs good, two-option contrast",
  steps: "2-4 numbered how-to steps, tutorial, solution walkthrough",
  callout: "single punchy warning or key takeaway",
  bigstat: "one impressive metric or standout number",
  flow: "sequential pipeline: request → handler → DB",
  hub: "center node wired to 3-4 tools/services/integrations",
  concept: "parent term broken into 2-3 sub-concepts",
  checklist: "3-6 ticked recap items, summary slide",
  promptcard: "copy-paste AI/CLI prompt the reader can steal",
  foldertree: "project directory structure, file layouts",
  commandpalette: "Cmd+K menu, IDE action list, tool selection",
  database: "2-table ERD/schema with relation glyph",
  gitbranch: "branch/merge workflow, feature-branch story",
  browser: "dashboard/product mockup with stat cards",
  quote: "expert pull-quote, principle, engineering philosophy",
  datatable: "✗/✓ two-column: jangan/lakukan, myth/reality",
  commandlist: "CLI command list: cmd → description rows",
  timeline: "dulu/sekarang, then/now evolution comparison",
  screenshot: "real evidence screenshot for case studies",
  custom: "bespoke HTML for layouts no typed mockup can draw",
  illustration: "unDraw SVG for analogies, abstract concepts, metaphors",
  apirequest: "HTTP API endpoint with method, URL, response body",
  eventqueue: "pub-sub/event-driven: producer → topic → consumer",
  latencycomp: "performance bar chart: compare response times/benchmarks",
  config: "config file mockup: .env, yaml, properties key-value",
  statemachine: "entity lifecycle: states + transitions (pending → active → done)",
  architecture: "simple deployment topology: client → LB → nodes",
};

export interface MockupDiversityContext {
  underusedTypes: string[];
  stats?: { type: string; count: number; percentage: number }[];
}

export async function generateSlidePlan(
  brief: string,
  model: LanguageModel,
  diversity?: MockupDiversityContext | string[]
): Promise<SlidePlan> {
  // Backward compat: accept bare string[] (old call sites pass underusedMockups)
  const ctx: MockupDiversityContext | undefined = Array.isArray(diversity)
    ? { underusedTypes: diversity }
    : diversity;

  let underusedInstruction = "";
  if (ctx && ctx.underusedTypes.length > 0) {
    const lines = ctx.underusedTypes.map((m) => {
      const desc = MOCKUP_USE_CASE[m] || "";
      const statLine = ctx.stats
        ? (() => {
            const s = ctx.stats.find((x) => x.type === m);
            return s ? ` (used ${s.percentage}% in recent decks)` : "";
          })()
        : "";
      return `  • ${m}${statLine}${desc ? ` — ${desc}` : ""}`;
    });

    underusedInstruction = `\n\n═══════════════════════════════════════════════════════════════
HISTORICAL MOCKUP DIVERSITY CONTEXT
═══════════════════════════════════════════════════════════════
The following mockup types have been UNDERUSED in recent carousels.
They are listed from least-used to most-used. Consider them IF they
fit the content semantically — do NOT force them if irrelevant, but
actively prefer them over overused types when the fit is equal:
${lines.join("\n")}

OVERUSED types (use sparingly — the audience has seen too many of these):
${ctx.stats
  ?.filter((s) => s.percentage >= 12)
  .map((s) => `  ✗ ${s.type} (${s.percentage}%)`)
  .join("\n") || "  (no data yet)"}
═══════════════════════════════════════════════════════════════`;
  }

  const systemPrompt = planSystem + underusedInstruction;

  return withRetry(async () => {
    // Skipped entirely for providers that reject responseFormat: the call cannot
    // succeed there, and paying for it doubles the latency of every plan.
    if (supportsStructuredOutput(model)) {
      try {
        const { object } = await generateObject({
          model,
          schema: slidePlanSchema,
          system: systemPrompt,
          prompt: planUserPrompt(brief),
          ...aiCallDefaults(),
        });
        return enforcePlanInvariants(object);
      } catch (err: any) {
        // The text path below exists for a model that answered with JSON the
        // schema rejects. A transport that never delivered an answer will not
        // answer the second time either -- it only spends another three SDK
        // attempts on a dead link, doubling the time before the caller learns
        // anything. That is how this crossed Cloudflare's 100s ceiling and
        // surfaced as a bare 524.
        if (isSdkRetryExhausted(err)) throw err;
        console.warn("generateObject failed, falling back to generateText:", err?.message || err);
      }
    }

    const { text } = await generateText({
      model,
      system: systemPrompt + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
      prompt: planUserPrompt(brief),
      ...aiCallDefaults(),
    });
    const parsed = extractAndParseJson(text);
    const repaired = repairSlidePlan(parsed);
    return enforcePlanInvariants(repaired);
  });
}

/** Prior revision turns on the same draft, oldest first. See lib/memory/repo.ts. */
export type RevisionHistory = { request: string; outcome?: string | null }[];

export async function reviseSlidePlan(
  plan: SlidePlan,
  message: string,
  model: LanguageModel,
  history: RevisionHistory = []
): Promise<SlidePlan> {
  const prompt = reviseUserPrompt(JSON.stringify(plan), message, history);
  return withRetry(async () => {
    if (supportsStructuredOutput(model)) {
      try {
        const { object } = await generateObject({
          model,
          schema: slidePlanSchema,
          system: reviseSystem,
          prompt,
          ...aiCallDefaults(),
        });
        return object;
      } catch (err: any) {
        if (isSdkRetryExhausted(err)) throw err;
        console.warn("reviseObject failed, falling back to generateText:", err?.message || err);
      }
    }

    const { text } = await generateText({
      model,
      system: reviseSystem + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
      prompt,
      ...aiCallDefaults(),
    });
    const parsed = extractAndParseJson(text);
    return repairSlidePlan(parsed);
  });
}

/* ── Scoped revision ──────────────────────────────────────────────────────
 * The model is only ever asked for the slides/fields the request targets, and the
 * result is merged into the previous plan in code. See lib/ai/revision-scope.ts for
 * why whole-plan regeneration was the wrong shape.
 *
 * Note what is deliberately NOT applied here: enforceIllustrationForAnalogySlides.
 * That safety net is for first generation. On a revision it would fight the user —
 * "ganti slide 4 jadi terminal" on a slide whose body says "kayak" would be silently
 * flipped back to illustration. */

const scopeClassificationSchema = z.object({
  slides: z.array(z.number().int()).default([]),
  globals: z.array(z.enum(["title", "caption", "hashtags"])).default([]),
  wholeDeck: z.boolean().default(false),
});

const slidePatchSchema = z.object({
  slides: z.array(z.object({ index: z.number().int(), slide: slideSchema })),
});

/**
 * Work out what the request targets: regex first, model only if that finds nothing.
 *
 * The regex handles the common shapes ("slide 4", "cover", "caption") for free and
 * deterministically. The classifier exists for content-addressed requests like "slide
 * soal race condition". A classifier failure degrades to whole-plan revision rather
 * than to a wrong scope.
 */
export async function resolveRevisionScope(
  plan: SlidePlan,
  message: string,
  model: LanguageModel
): Promise<RevisionScope> {
  const parsed = parseRevisionScope(message, plan.slides.length);
  if (parsed.resolved || parsed.reasonCode !== "no-target") return parsed;

  const prompt = scopeClassifierPrompt(message, plan);

  try {
    // The structured-output guard every other call site already had. Without it this asked
    // OmniRoute for a responseFormat it does not implement, which fails 100% of the time —
    // so on the only provider in production, the classifier never once returned an answer.
    // It cost a full model call and then degraded to whole-plan revision, which is why a
    // request to change a few words came back with the slide's layout and mockup replaced.
    let raw: z.infer<typeof scopeClassificationSchema>;
    if (supportsStructuredOutput(model)) {
      raw = (
        await generateObject({
          model,
          schema: scopeClassificationSchema,
          system: scopeClassifierSystem,
          prompt,
          ...aiCallDefaults(),
        })
      ).object;
    } else {
      const { text } = await generateText({
        model,
        system:
          scopeClassifierSystem +
          "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
        prompt,
        ...aiCallDefaults(),
      });
      raw = scopeClassificationSchema.parse(extractAndParseJson(text));
    }
    return scopeFromClassifier(raw, plan.slides.length, message);
  } catch (err: unknown) {
    console.warn("[revision-scope] classifier failed, falling back to whole-plan revision:", err);
    return parsed;
  }
}

async function reviseTargetSlides(
  plan: SlidePlan,
  scope: RevisionScope,
  message: string,
  model: LanguageModel,
  history: RevisionHistory
): Promise<ScopedPatch["slides"]> {
  const targets = scope.slides.map((i) => ({
    index: i + 1,
    slideJson: JSON.stringify(plan.slides[i], null, 2),
  }));
  const prompt = scopedSlideRevisePrompt(JSON.stringify(plan), targets, message, history);

  return withRetry(async () => {
    if (supportsStructuredOutput(model)) {
      try {
        const { object } = await generateObject({
          model,
          schema: slidePatchSchema,
          system: scopedSlideReviseSystem,
          prompt,
          ...aiCallDefaults(),
        });
        return object.slides.map((s) => ({ index: s.index - 1, slide: s.slide }));
      } catch (err: unknown) {
        if (isSdkRetryExhausted(err)) throw err;
        console.warn("[revision-scope] scoped slide generateObject failed, using text:", err);
      }
    }

    const { text } = await generateText({
      model,
      system: scopedSlideReviseSystem + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
      prompt,
      ...aiCallDefaults(),
    });
    // Repaired before validating, exactly as generation and whole-plan revision do. This
    // path skipped it, so a mockup one field short threw and cost the whole turn — the
    // same output would have been salvaged anywhere else. Measured against the live model
    // on 25 Aug 2026: a revision to a typed mockup died on `expected string, received
    // undefined` while the identical request through generation came back fine.
    const raw = extractAndParseJson(text) as { slides?: { index?: number; slide?: any }[] };
    for (const entry of raw?.slides ?? []) {
      const patched = entry?.slide;
      if (!patched || typeof patched !== "object") continue;

      // Whether the model MEANT to send a mockup, recorded before repair can drop it.
      const offered = "mockup" in patched;
      repairSlide(patched);

      // Repair dropped a mockup the model did meant to send, because it came back
      // malformed. Left as-is the merge would then delete the slide's existing mockup —
      // the aspect is in scope, and an in-scope field missing from the patch reads as
      // "remove it". The slide would render with an empty half, which is the blank box
      // this whole thread has been chasing. Carrying the previous mockup forward makes
      // the worst case "unchanged" instead of "worse than before".
      //
      // Only when the model offered one: a request that genuinely asks to remove the
      // mockup sends no `mockup` key at all, and that still removes it.
      if (offered && !("mockup" in patched)) {
        const previous: any = plan.slides[(entry.index ?? 0) - 1];
        if (previous?.mockup) {
          console.warn(
            `[revision-scope] slide ${entry.index}: model's new mockup was unusable — keeping the previous one rather than leaving the slide empty.`
          );
          patched.mockup = previous.mockup;
        }
      }
    }

    const parsed = slidePatchSchema.parse(raw);
    return parsed.slides.map((s) => ({ index: s.index - 1, slide: s.slide }));
  });
}

async function reviseGlobalFields(
  plan: SlidePlan,
  scope: RevisionScope,
  message: string,
  model: LanguageModel,
  history: RevisionHistory
): Promise<ScopedPatch> {
  // Built from the scope so the model has no field to fill in that it was not asked for.
  const shape: Record<string, z.ZodTypeAny> = {};
  if (scope.globals.includes("title")) shape.title = z.string().min(1).max(90);
  if (scope.globals.includes("caption")) shape.caption = z.string().min(1).max(2200);
  if (scope.globals.includes("hashtags")) shape.hashtags = z.array(z.string().min(1).max(30)).length(5);
  const schema = z.object(shape);

  const prompt = scopedGlobalRevisePrompt(JSON.stringify(plan), scope.globals, message, history);

  return withRetry(async () => {
    if (supportsStructuredOutput(model)) {
      try {
        const { object } = await generateObject({
          model,
          schema,
          system: scopedGlobalReviseSystem,
          prompt,
          ...aiCallDefaults(),
        });
        return object as ScopedPatch;
      } catch (err: unknown) {
        if (isSdkRetryExhausted(err)) throw err;
        console.warn("[revision-scope] scoped global generateObject failed, using text:", err);
      }
    }

    const { text } = await generateText({
      model,
      system: scopedGlobalReviseSystem + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
      prompt,
      ...aiCallDefaults(),
    });
    return schema.parse(extractAndParseJson(text)) as ScopedPatch;
  });
}

export interface ScopedRevisionResult {
  plan: SlidePlan;
  scope: RevisionScope;
  /** Which in-scope slides/fields actually came back different. Empty means a no-op. */
  changed: string[];
}

export async function reviseSlidePlanScoped(
  plan: SlidePlan,
  message: string,
  model: LanguageModel,
  history: RevisionHistory = []
): Promise<ScopedRevisionResult> {
  const scope = await resolveRevisionScope(plan, message, model);

  if (!scope.resolved) {
    // Nothing to protect: the request legitimately covers the whole deck.
    const revised = await reviseSlidePlan(plan, message, model, history);
    return { plan: revised, scope, changed: [] };
  }

  // Independent calls — a request can target a slide and the caption at once.
  const [slidePatch, globalPatch] = await Promise.all([
    scope.slides.length ? reviseTargetSlides(plan, scope, message, model, history) : Promise.resolve(undefined),
    scope.globals.length ? reviseGlobalFields(plan, scope, message, model, history) : Promise.resolve({}),
  ]);

  const merged = mergeScopedRevision(plan, { ...globalPatch, slides: slidePatch }, scope);
  assertScopePreserved(plan, merged, scope);

  return { plan: merged, scope, changed: scopedChangeSummary(plan, merged, scope) };
}

export async function polishBriefVoice(brief: string, model: LanguageModel): Promise<string> {
  return withRetry(async () => {
    const { text } = await generateText({
      model,
      system: humanVoiceEditorSystem,
      prompt: humanVoiceEditorUserPrompt(brief),
      ...aiCallDefaults(),
    });
    return text;
  });
}
