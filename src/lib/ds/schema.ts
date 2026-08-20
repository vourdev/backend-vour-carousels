import { z } from "zod";
import { normalizeIcon } from "../ds/icons";
import { normalizeIllustration } from "../ds/illustrations";

const cardTone = z.enum(["peach", "stone", "mint", "sky", "pink", "amber"]);

/** Any incoming icon string is coerced to a valid allowlist slug (fallback: sparkles). */
const iconField = z.string().transform(normalizeIcon);

/* ── Mockup types ─────────────────────────────────────────────── */

/** Classic InfoCard — icon + title + body on a colored card */
const mockupCard = z.object({
  type: z.literal("card"),
  icon: iconField,
  title: z.string().max(50),
  body: z.string().max(120),
  tone: cardTone,
});

/** Mac-style terminal window with syntax-highlighted lines */
const mockupTerminal = z.object({
  type: z.literal("terminal"),
  filename: z.string().max(40),
  lines: z
    .array(
      z.object({
        text: z.string().max(60),
        style: z.enum(["plain", "key", "val", "kw", "cmt", "num"]).default("plain"),
      })
    )
    .max(8),
});

/** Two-panel comparison: loser (stone) vs winner (peach) */
const mockupComparison = z.object({
  type: z.literal("comparison"),
  loserLabel: z.string().max(40),
  loserLine: z.string().max(70),
  winnerLabel: z.string().max(40),
  winnerLine: z.string().max(70),
  winnerRationale: z.string().max(100).optional(),
});

/** Numbered step cards (2–4 steps) — for solution/tutorial slides */
const mockupSteps = z.object({
  type: z.literal("steps"),
  items: z
    .array(z.object({ title: z.string().max(40), body: z.string().max(70) }))
    .min(2)
    .max(4),
});

/** Dark callout banner with icon — for key takeaways/warnings */
const mockupCallout = z.object({
  type: z.literal("callout"),
  icon: iconField,
  text: z.string().max(120),
});

/** Big editorial metric — one standout number */
const mockupBigstat = z.object({
  type: z.literal("bigstat"),
  number: z.string().max(10),
  unit: z.string().max(30).optional(),
  caption: z.string().max(90),
});

/** Flow chain — sequential nodes joined by arrows (pipelines/sequences) */
const mockupFlow = z.object({
  type: z.literal("flow"),
  steps: z
    .array(z.object({ label: z.string().max(24), focus: z.boolean().optional() }))
    .min(2)
    .max(5),
  note: z.string().max(90).optional(),
});

/** Concept hub — parent node → 3–4 child pills (term glossaries) */
/**
 * Parent term broken into sub-concepts.
 *
 * Capped at 3 children by slicing rather than by `.max()`: a 4th child makes the row
 * too dense to read at 1080px, but rejecting the plan over it would throw away an
 * otherwise good deck — and would break re-parsing the older plans in the carousels
 * history table, which were generated when the cap was 4.
 */
const mockupConcept = z.object({
  type: z.literal("concept"),
  parent: z.string().max(20),
  children: z
    .array(z.string().max(18))
    .min(2)
    .transform((c) => c.slice(0, 3)),
  note: z.string().max(90).optional(),
});

/** Icon hub — center node → 3–4 tool icons via dashed arrows */
const mockupHub = z.object({
  type: z.literal("hub"),
  center: z.string().max(20),
  tools: z
    .array(z.object({ icon: iconField, label: z.string().max(16) }))
    .min(2)
    .max(4),
  note: z.string().max(90).optional(),
});

/** Recap checklist — 3–6 ticked items */
const mockupChecklist = z.object({
  type: z.literal("checklist"),
  items: z.array(z.string().max(48)).min(2).max(6),
  note: z.string().max(90).optional(),
});

/** Browser window — product mockup: url bar + 2–4 stat cards (dashboard look) */
const mockupBrowser = z.object({
  type: z.literal("browser"),
  url: z.string().max(40),
  cards: z
    .array(z.object({ label: z.string().max(24), value: z.string().max(16) }))
    .min(2)
    .max(4),
  note: z.string().max(90).optional(),
});

/** Quote inset — editorial pull-quote (EB Garamond) with optional attribution */
const mockupQuote = z.object({
  type: z.literal("quote"),
  quote: z.string().max(180),
  author: z.string().max(40).optional(),
});

/** Data table — ✗/✓ two-column comparison (2–4 rows): "jangan / lakukan" */
const mockupDataTable = z.object({
  type: z.literal("datatable"),
  noLabel: z.string().max(20).default("Jangan"),
  okLabel: z.string().max(20).default("Lakukan"),
  rows: z
    .array(z.object({ no: z.string().max(50), ok: z.string().max(50) }))
    .min(2)
    .max(4),
});

/** Command list — mono `cmd → desc` rows (2–6): CLI menus, shortcut lists */
const mockupCommandList = z.object({
  type: z.literal("commandlist"),
  rows: z
    .array(z.object({ cmd: z.string().max(24), desc: z.string().max(48) }))
    .min(2)
    .max(6),
  note: z.string().max(90).optional(),
});

/** Timeline — two dated cards side-by-side (then / now, dulu / sekarang) */
const mockupTimeline = z.object({
  type: z.literal("timeline"),
  oldLabel: z.string().max(20),
  oldTitle: z.string().max(30),
  oldBody: z.string().max(90),
  newLabel: z.string().max(20),
  newTitle: z.string().max(30),
  newBody: z.string().max(90),
});

/** Prompt card — a copy-paste AI prompt in a bordered mono block */
const mockupPromptcard = z.object({
  type: z.literal("promptcard"),
  label: z.string().max(20).default("COPY THIS"),
  body: z.string().max(180),
});

/** Folder tree — mono directory listing (3–8 rows), one active row in the brand accent */
const mockupFolderTree = z.object({
  type: z.literal("foldertree"),
  lines: z
    .array(z.object({ text: z.string().max(48), active: z.boolean().optional() }))
    .min(3)
    .max(8),
});

/** Command palette — Cmd+K menu on an Ink surface: query + 2–5 icon rows */
const mockupCommandPalette = z.object({
  type: z.literal("commandpalette"),
  query: z.string().max(30),
  rows: z
    .array(
      z.object({ icon: iconField, label: z.string().max(40), active: z.boolean().optional() })
    )
    .min(2)
    .max(5),
});

/** Database — two related tables (schema/ERD), each 2–4 typed columns + relation glyph */
const mockupDatabase = z.object({
  type: z.literal("database"),
  tables: z
    .array(
      z.object({
        name: z.string().max(20),
        rows: z
          .array(z.object({ col: z.string().max(16), type: z.string().max(8) }))
          .min(2)
          .max(4),
      })
    )
    .length(2),
  relation: z.string().max(12).default("1 ─< ∞"),
});

/** Git branch — fixed 2-branch SVG diagram (feature branch + merge back to main) */
const mockupGitBranch = z.object({
  type: z.literal("gitbranch"),
  main: z.array(z.string().max(16)).min(2).max(6),
  branch: z.object({ name: z.string().max(16), at: z.number().int().min(0) }),
  mergeLabel: z.string().max(12).default("merge"),
});

/**
 * Illustration — unDraw editorial SVG for abstract concepts / analogies.
 *
 * The model's entire vocabulary here is: which slugs, and how many. Colour, size,
 * spacing and surface variant are resolved by the renderer — there is deliberately no
 * field to override any of them, because a model-supplied colour cannot be re-scoped
 * per surface the way a CSS token can (see the surface-token note in
 * carousel-css-extra.ts). Capped at 2: the content column is 920px wide, so two items
 * plus the 28px gap already fill it at 446px each — a third would have to shrink below
 * the width where an unDraw drawing stays readable.
 */
const mockupIllustration = z.object({
  type: z.literal("illustration"),
  illustrationSlugs: z
    .array(z.string().transform(normalizeIllustration))
    .min(1)
    .max(2),
  caption: z.string().max(90).optional(),
});

/**
 * Accept the pre-array shape ({ illustrationSlug, illustrationSlug2 }) and fold it into
 * illustrationSlugs. Plans are persisted in the carousels history table and re-parsed on
 * load, so dropping the old keys outright would break every deck already saved. It also
 * absorbs a model that still emits the old field names from a stale prompt.
 */
function migrateLegacyIllustration(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const m = raw as Record<string, unknown>;
  if (m.type !== "illustration" || Array.isArray(m.illustrationSlugs)) return raw;
  const legacy = [m.illustrationSlug, m.illustrationSlug2].filter(
    (s): s is string => typeof s === "string" && s.trim() !== ""
  );
  if (!legacy.length) return raw;
  const rest: Record<string, unknown> = { ...m };
  delete rest.illustrationSlug;
  delete rest.illustrationSlug2;
  return { ...rest, illustrationSlugs: legacy };
}

export const screenshotBriefSchema = z.object({
  source: z.string().max(120),
  mustShow: z.string().max(160),
  mustHide: z.string().max(160),
  cropRatio: z.string().default("4:5"),
});

export const screenshotImageSchema = z.object({
  dataUrl: z.string(),
  uploadedAt: z.string(),
});

/** Screenshot evidence — real case study / incident screenshot */
const mockupScreenshot = z.object({
  type: z.literal("screenshot"),
  screenshotBrief: screenshotBriefSchema.optional(),
  screenshotImage: screenshotImageSchema.optional(),
  evidenceStatus: z.enum(["pending", "captured", "fallback_used"]).default("pending"),
});

/**
 * Custom — structural escape hatch for content that fits none of the built-in mockups.
 *
 * There is no `css` field and no styling channel of any kind: whatever HTML arrives is
 * run through sanitizeCustomHtml at render time, which strips <style>, inline style=,
 * presentational attributes, and every class outside CUSTOM_CLASS_WHITELIST. Structure
 * and copy are the model's; appearance is the design system's.
 */
const mockupCustom = z.object({
  type: z.literal("custom"),
  html: z.string().max(8000),
});

const mockupApiRequest = z.object({
  type: z.literal("apirequest"),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
  url: z.string().max(60),
  status: z.string().max(20).default("200 OK"),
  headers: z.array(z.object({ key: z.string().max(24), value: z.string().max(36) })).max(3).optional(),
  responseBody: z.string().max(300),
});

const mockupEventQueue = z.object({
  type: z.literal("eventqueue"),
  producer: z.string().max(24),
  topicName: z.string().max(24),
  events: z.array(z.string().max(32)).min(2).max(4),
  consumer: z.string().max(24),
});

const mockupLatencyComp = z.object({
  type: z.literal("latencycomp"),
  items: z.array(
    z.object({
      label: z.string().max(24),
      value: z.string().max(16),
      percentage: z.number().min(5).max(100),
      highlight: z.boolean().optional(),
    })
  ).min(2).max(3),
  note: z.string().max(90).optional(),
});

const mockupConfig = z.object({
  type: z.literal("config"),
  filename: z.string().max(40),
  lines: z.array(
    z.object({
      key: z.string().max(24),
      val: z.string().max(48),
      comment: z.string().max(48).optional(),
    })
  ).min(2).max(6),
});

const mockupStateMachine = z.object({
  type: z.literal("statemachine"),
  states: z.array(
    z.object({
      name: z.string().max(16),
      status: z.enum(["active", "passed", "pending"]).default("pending"),
    })
  ).min(2).max(4),
  transitions: z.array(z.string().max(20)).max(3),
});

const mockupArchitecture = z.object({
  type: z.literal("architecture"),
  title: z.string().max(30).optional(),
  client: z.string().max(20).default("Client"),
  router: z.string().max(20).default("Load Balancer"),
  nodes: z.array(z.string().max(20)).min(2).max(3),
});

/**
 * Decision guide — 2-3 options, each with the condition that selects it.
 *
 * `.optional()` on `question`, not `.default()`: a default makes the field REQUIRED on
 * the inferred output type, which breaks every `Mockup` literal that omits it. The
 * renderer supplies the fallback.
 *
 * The deliberate omission is any notion of a winner. The three existing comparison
 * mockups all declare one — comparison paints loser/winner, datatable is jangan/lakukan,
 * timeline is dulu/sekarang — and the "kapan pakai yang mana" deck has no winner to
 * declare. Three options are allowed because the real decks need three ("/24, /29 dan
 * /30"); nothing else in the catalogue can hold a third.
 */
const mockupDecision = z.object({
  type: z.literal("decision"),
  question: z.string().max(60).optional(),
  options: z
    .array(
      z.object({
        name: z.string().max(22),
        when: z.string().max(80),
        tag: z.string().max(14).optional(),
      })
    )
    .min(2)
    .max(3),
  note: z.string().max(90).optional(),
});

/** Myth/fact — a misconception, its correction, and optionally why it matters. */
const mockupMythFact = z.object({
  type: z.literal("mythfact"),
  myth: z.string().max(90),
  fact: z.string().max(90),
  because: z.string().max(110).optional(),
});

/**
 * Pitfalls — 3-5 numbered mistakes or warning signs, optionally graded.
 *
 * Numbered rather than ticked: this is the "N Kesalahan" shape, and `checklist` marks
 * every row with a ✓, which against a mistake reads as "done".
 */
const mockupPitfalls = z.object({
  type: z.literal("pitfalls"),
  items: z
    .array(
      z.object({
        text: z.string().max(64),
        level: z.enum(["low", "mid", "high"]).optional(),
      })
    )
    .min(3)
    .max(5),
  note: z.string().max(90).optional(),
});

const mockupUnion = z.discriminatedUnion("type", [
  mockupCard,
  mockupTerminal,
  mockupComparison,
  mockupSteps,
  mockupCallout,
  mockupBigstat,
  mockupFlow,
  mockupConcept,
  mockupHub,
  mockupChecklist,
  mockupBrowser,
  mockupQuote,
  mockupDataTable,
  mockupCommandList,
  mockupTimeline,
  mockupPromptcard,
  mockupFolderTree,
  mockupCommandPalette,
  mockupDatabase,
  mockupGitBranch,
  mockupIllustration,
  mockupScreenshot,
  mockupCustom,
  mockupApiRequest,
  mockupEventQueue,
  mockupLatencyComp,
  mockupConfig,
  mockupStateMachine,
  mockupArchitecture,
  mockupDecision,
  mockupMythFact,
  mockupPitfalls,
]);

export const mockupSchema = z.preprocess(migrateLegacyIllustration, mockupUnion);

export type Mockup = z.infer<typeof mockupUnion>;

/* ── Cover hook (intro scroll-stopper) ────────────────────────── */

const coverHookDevice = z.object({
  kind: z.literal("device"),
  chrome: z.enum(["browser", "terminal"]).default("browser"),
  label: z.string().max(40).optional(),
  lines: z
    .array(
      z.object({
        text: z.string().max(52),
        style: z.enum(["plain", "key", "val", "kw", "cmt", "num"]).default("plain"),
      })
    )
    .min(1)
    .max(6),
});

// Reserved for Phase 2 (wizard attach-screenshot). Not emitted by the wizard yet.
const coverHookImage = z.object({
  kind: z.literal("image"),
  src: z.string(),
  frame: z.enum(["browser", "phone", "plain"]).default("browser"),
  label: z.string().max(40).optional(),
});

// Same contract as mockupCustom: structure only, no styling channel.
const coverHookCustom = z.object({
  kind: z.literal("custom"),
  html: z.string().max(4000),
});

/** Cover anchor — an ID badge (contrarian "X is not a job title" angle) */
const coverHookBadge = z.object({
  kind: z.literal("badge"),
  eyebrowLine: z.string().max(24).optional(), // renderer falls back to "ID · 2026"
  role: z.string().max(22),
  sub: z.string().max(40).optional(),
  struck: z.boolean().optional(),
});

/** Cover anchor — a NOC status grid, all nodes down (risk) or up (recovered).
 *  .optional() not .default(): .default() makes fields REQUIRED on the inferred
 *  output type (Slide), breaking literals. The renderer supplies fallbacks. */
const coverHookNocGrid = z.object({
  kind: z.literal("nocgrid"),
  cols: z.number().int().min(3).max(6).optional(),
  rows: z.number().int().min(2).max(4).optional(),
  state: z.enum(["down", "up"]).optional(),
  banner: z.string().max(24).optional(),
});

/** Cover anchor — a Norman door: pull handle labeled with a contradicting action */
const coverHookDoor = z.object({
  kind: z.literal("door"),
  label: z.string().max(12).optional(), // renderer falls back to "DORONG"
  pull: z.boolean().optional(),
});

export const coverHookSchema = z.discriminatedUnion("kind", [
  coverHookDevice,
  coverHookImage,
  coverHookCustom,
  coverHookBadge,
  coverHookNocGrid,
  coverHookDoor,
]);

export type CoverHook = z.infer<typeof coverHookSchema>;

/* ── Slide types ──────────────────────────────────────────────── */

const coverSlide = z.object({
  role: z.literal("cover"),
  eyebrow: z.string().max(40),
  headline: z.string().max(90),
  accentWord: z.string().optional(),
  lede: z.string().max(140).optional(),
  stamp: z.string().optional(),
  ghostNumeral: z.string().optional(),
  hook: coverHookSchema.optional(),
});

const pointSlide = z.object({
  role: z.literal("point"),
  counter: z.string(),
  eyebrow: z.string().max(40),
  headline: z.string().max(90),
  accentWord: z.string().optional(),
  body: z.string().max(160),
  /** Slide surface: "ink" (full dark) for deck rhythm; absent/"paper" = default cream */
  surface: z.enum(["paper", "ink"]).optional(),
  /**
   * Composition template. Absent means "renderer's choice" — NOT "standard".
   *
   * This carried .default("standard"), which made the field impossible to leave unset:
   * every plan came out of parsing with an explicit "standard" on every point slide, so
   * the renderer could not tell a deliberate choice from an omission and the whole deck
   * fell back to one composition. See resolveLayout in render-slide.ts.
   */
  layout: z.enum(["standard", "mockup-forward", "split-content", "note-emphasis"]).optional(),
  /** New: rich mockup component (preferred) */
  mockup: mockupSchema.optional(),
  /** Legacy: simple info card (backward compat — used when mockup is absent) */
  card: z
    .object({
      icon: iconField,
      title: z.string().max(50),
      body: z.string().max(120),
      tone: cardTone,
    })
    .optional(),
});

const outroSlide = z.object({
  role: z.literal("outro"),
  eyebrow: z.string().max(40).optional(),
  headline: z.string().max(90),
  accentWord: z.string().optional(),
  body: z.string().max(160).optional(),
  surface: z.enum(["paper", "ink"]).optional(),
  cta: z.object({
    strong: z.string().max(60),
    sub: z.string().max(90).optional(),
  }),
});

export const slideSchema = z.discriminatedUnion("role", [coverSlide, pointSlide, outroSlide]);

export const slidePlanSchema = z.object({
  title: z.string().min(1).max(90),
  caption: z.string().min(1).max(2200),
  hashtags: z.array(z.string().min(1).max(30)).length(5),
  slides: z.array(slideSchema).min(1),
});

export type Slide = z.infer<typeof slideSchema>;
export type SlidePlan = z.infer<typeof slidePlanSchema>;
