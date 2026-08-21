import { generateText, generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { slidePlanSchema, slideSchema, type SlidePlan } from "../ds/schema";
import { repairSlidePlan } from "../ds/repair";
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

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`AI call attempt ${i + 1} failed:`, err);
      lastError = err;
      if (i < attempts - 1) {
        // Exponential backoff: 2.5s, 5s
        await delay((i + 1) * 2500);
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

function extractAndParseJson(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

export async function generateBrief(idea: string, model: LanguageModel): Promise<string> {
  return withRetry(async () => {
    const { text } = await generateText({
      model,
      system: briefSystem,
      prompt: briefUserPrompt(idea),
    });
    return text;
  });
}

/**
 * Analogy keywords that trigger the illustration safety net.
 * If a point slide's body contains any of these words but the model chose
 * a non-illustration mockup, we override it here — no re-generation needed.
 */
const ANALOGY_KEYWORDS = ["kayak", "ibarat", "mirip", "bayangkan", "seperti"];

/** Fallback slug used when the safety net overrides a mockup to illustration. */
const ILLUSTRATION_FALLBACK_SLUG = "online-learning_tgmv";

/**
 * Post-processing pass: enforce illustration mockup for any point slide
 * whose body text signals an analogy/metaphor but the model picked something
 * else. This is a code-level safety net that does not rely on model compliance.
 */
function enforceIllustrationForAnalogySlides(plan: SlidePlan): SlidePlan {
  const slides = plan.slides.map((slide) => {
    if (slide.role !== "point") return slide;
    const body = (slide.body ?? "").toLowerCase();
    const hasAnalogy = ANALOGY_KEYWORDS.some((kw) => body.includes(kw));
    if (!hasAnalogy) return slide;
    if (slide.mockup?.type === "illustration") return slide;
    // Override: the slide uses analogy language but got a technical mockup
    console.warn(
      `[illustration-safety-net] Slide "${slide.eyebrow}" has analogy keywords but mockup="${slide.mockup?.type ?? "none"}". Overriding to illustration.`
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

/** Mockup types that render best when the mockup dominates (mockup-forward layout). */
const HERO_MOCKUP_TYPES = new Set(["terminal", "database", "gitbranch", "foldertree", "commandpalette", "browser"]);

/** Mockup types whose "note" field is typically a key takeaway worth emphasizing. */
const NOTE_BEARING_TYPES = new Set(["flow", "hub", "concept", "checklist", "comparison"]);

/**
 * Post-processing pass: enforce layout diversity across point slides.
 *
 * The model is asked for layout variety via the prompt, but in practice often emits
 * "standard" for every slide. This enforcement assigns contextually appropriate layouts
 * based on mockup type and content, guaranteeing at least 2 different layouts in any
 * deck with ≥ 3 point slides, and no 3 consecutive slides with the same layout.
 *
 * Generation only — not applied on revision (same reason as enforceMockupForPointSlides).
 */
export function enforceLayoutDiversity(plan: SlidePlan): SlidePlan {
  const pointSlides = plan.slides.filter((s) => s.role === "point");
  if (pointSlides.length < 3) return plan; // too few to worry about

  // Check: are all layouts identical?
  const layouts = pointSlides.map((s) => s.layout || "standard");
  const uniqueLayouts = new Set(layouts);

  // Only intervene if diversity is insufficient (all same layout)
  if (uniqueLayouts.size >= 2) {
    // Still check for 3+ consecutive same layout and fix those
    return enforceNoThreeConsecutiveLayouts(plan);
  }

  // All layouts are the same — assign contextually appropriate ones
  console.warn(
    `[layout-diversity] All ${pointSlides.length} point slides have layout="${layouts[0]}". Redistributing.`
  );

  let pointIndex = 0;
  const slides = plan.slides.map((slide) => {
    if (slide.role !== "point") return slide;

    const mockupType = slide.mockup?.type;
    let newLayout: string = slide.layout || "standard";

    // Rule 1: Hero mockup types → mockup-forward
    if (mockupType && HERO_MOCKUP_TYPES.has(mockupType) && pointIndex % 3 === 1) {
      newLayout = "mockup-forward";
    }
    // Rule 2: Mockups with note that carry key conclusions → note-emphasis
    else if (
      mockupType &&
      NOTE_BEARING_TYPES.has(mockupType) &&
      slide.mockup &&
      "note" in slide.mockup &&
      (slide.mockup as any).note &&
      pointIndex % 4 === 2
    ) {
      newLayout = "note-emphasis";
    }
    // Rule 3: Short body text + non-hero mockup → split-content
    else if (
      slide.body &&
      slide.body.length < 80 &&
      mockupType &&
      !HERO_MOCKUP_TYPES.has(mockupType) &&
      pointIndex % 3 === 0 &&
      pointIndex > 0
    ) {
      newLayout = "split-content";
    }

    pointIndex++;
    if (newLayout === (slide.layout || "standard")) return slide;
    return { ...slide, layout: newLayout as any };
  });

  return enforceNoThreeConsecutiveLayouts({ ...plan, slides });
}

/**
 * Fixes any run of 3+ consecutive point slides with the same layout by cycling
 * through alternatives on the third slide in each run.
 */
function enforceNoThreeConsecutiveLayouts(plan: SlidePlan): SlidePlan {
  const alternatives = ["standard", "mockup-forward", "split-content", "note-emphasis"];
  const slides = [...plan.slides];
  let runLength = 1;
  let lastLayout = "";

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.role !== "point") {
      runLength = 0;
      lastLayout = "";
      continue;
    }

    const layout = slide.layout || "standard";
    if (layout === lastLayout) {
      runLength++;
    } else {
      runLength = 1;
      lastLayout = layout;
    }

    if (runLength >= 3) {
      // Pick a different layout
      const alt = alternatives.find((l) => l !== layout) || "mockup-forward";
      slides[i] = { ...slide, layout: alt as any };
      lastLayout = alt;
      runLength = 1;
    }
  }

  return { ...plan, slides };
}

/** All code-level safety nets, in the order they must run. */
function enforcePlanInvariants(plan: SlidePlan): SlidePlan {
  return enforceLayoutDiversity(
    enforceMockupForPointSlides(enforceIllustrationForAnalogySlides(plan))
  );
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
    try {
      const { object } = await generateObject({
        model,
        schema: slidePlanSchema,
        system: systemPrompt,
        prompt: planUserPrompt(brief),
      });
      return enforcePlanInvariants(object);
    } catch (err: any) {
      console.warn("generateObject failed, trying generateText + JSON parse fallback:", err?.message || err);
      const { text } = await generateText({
        model,
        system: systemPrompt + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
        prompt: planUserPrompt(brief),
      });
      const parsed = extractAndParseJson(text);
      const repaired = repairSlidePlan(parsed);
      return enforcePlanInvariants(repaired);
    }
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
    try {
      const { object } = await generateObject({
        model,
        schema: slidePlanSchema,
        system: reviseSystem,
        prompt,
      });
      return object;
    } catch (err: any) {
      console.warn("reviseObject failed, trying generateText + JSON parse fallback:", err?.message || err);
      const { text } = await generateText({
        model,
        system: reviseSystem + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
        prompt,
      });
      const parsed = extractAndParseJson(text);
      return repairSlidePlan(parsed);
    }
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

  try {
    const { object } = await generateObject({
      model,
      schema: scopeClassificationSchema,
      system: scopeClassifierSystem,
      prompt: scopeClassifierPrompt(message, plan),
    });
    return scopeFromClassifier(object, plan.slides.length);
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
    try {
      const { object } = await generateObject({
        model,
        schema: slidePatchSchema,
        system: scopedSlideReviseSystem,
        prompt,
      });
      return object.slides.map((s) => ({ index: s.index - 1, slide: s.slide }));
    } catch (err: unknown) {
      console.warn("[revision-scope] scoped slide generateObject failed, retrying as text:", err);
      const { text } = await generateText({
        model,
        system: scopedSlideReviseSystem + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
        prompt,
      });
      const parsed = slidePatchSchema.parse(extractAndParseJson(text));
      return parsed.slides.map((s) => ({ index: s.index - 1, slide: s.slide }));
    }
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
    try {
      const { object } = await generateObject({
        model,
        schema,
        system: scopedGlobalReviseSystem,
        prompt,
      });
      return object as ScopedPatch;
    } catch (err: unknown) {
      console.warn("[revision-scope] scoped global generateObject failed, retrying as text:", err);
      const { text } = await generateText({
        model,
        system: scopedGlobalReviseSystem + "\nIMPORTANT: Return ONLY valid JSON matching the schema. No markdown codeblocks or extra text.",
        prompt,
      });
      return schema.parse(extractAndParseJson(text)) as ScopedPatch;
    }
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
    });
    return text;
  });
}
