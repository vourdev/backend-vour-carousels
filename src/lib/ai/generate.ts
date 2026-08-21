import { generateText, generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { slidePlanSchema, slideSchema, type SlidePlan } from "../ds/schema";
import { repairSlidePlan } from "../ds/repair";
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

export async function generateSlidePlan(brief: string, model: LanguageModel, underusedMockups?: string[]): Promise<SlidePlan> {
  const underusedInstruction = underusedMockups && underusedMockups.length > 0
    ? `\n\n═══════════════════════════════════════════════════════════════
HISTORICAL MOCKUP DIVERSITY CONTEXT (Underused Mockups)
═══════════════════════════════════════════════════════════════
The following mockup types have been UNDERUSED in recent carousels.
Prioritize using them in this deck IF they fit the content semantically (do not force them if irrelevant):
${underusedMockups.map(m => `- ${m}`).join("\n")}
═══════════════════════════════════════════════════════════════`
    : "";

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
