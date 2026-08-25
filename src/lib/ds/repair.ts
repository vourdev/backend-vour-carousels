import { mockupSchema, slidePlanSchema, coverHookSchema, type SlidePlan } from "../ds/schema";
import { hoistAccentMarkdown } from "../ds/accent";
import { FALLBACK_ILLUSTRATION } from "../ds/illustrations";

/**
 * Best-effort repair of a raw LLM slide-plan object BEFORE strict validation.
 *
 * The model occasionally violates recoverable constraints — a `concept` hub with
 * one child, an over-long headline, a missing `hashtags` key. Left alone, Zod
 * rejects the ENTIRE plan and the whole generation dies (see the
 * `slides[n].mockup.children too_small` crash). This pass coerces the common,
 * recoverable violations so a single bad field never nukes an 8-slide deck:
 *
 *  - array fields clamped to their max;
 *  - a mockup that still fails `mockupSchema` is DROPPED (the point slide then
 *    falls back to its auto-card in resolveMockup — never flat, never crashing);
 *  - well-known long strings truncated to their schema max;
 *  - required top-level keys defaulted.
 *
 * Anything genuinely unrecoverable (e.g. a slide with no headline) still throws
 * from the final `slidePlanSchema.parse` — that is a real error, not slop.
 */

/**
 * Clean a copy string: strip em/en-dashes (banned in v1.0 slide copy — DESIGN.md
 * voice rules) then truncate to `max`. Non-strings pass through untouched.
 *  - " — " (em-dash as clause separator) → ", "
 *  - bare "—" → ", " ; en-dash "–" → "-" (ranges)
 */
function clampStr<T>(v: T, max: number): T {
  if (typeof v !== "string") return v;
  let s = v.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");
  if (s.length > max) s = s.slice(0, max);
  return s as unknown as T;
}

const MOCKUP_ARRAY_MAX: Record<string, { key: string; max: number }> = {
  terminal: { key: "lines", max: 8 },
  steps: { key: "items", max: 4 },
  flow: { key: "steps", max: 5 },
  concept: { key: "children", max: 4 },
  hub: { key: "tools", max: 4 },
  checklist: { key: "items", max: 6 },
  browser: { key: "cards", max: 4 },
  datatable: { key: "rows", max: 4 },
  commandlist: { key: "rows", max: 6 },
  foldertree: { key: "lines", max: 8 },
  commandpalette: { key: "rows", max: 5 },
  database: { key: "tables", max: 2 },
  gitbranch: { key: "main", max: 6 },
  apirequest: { key: "headers", max: 3 },
  eventqueue: { key: "events", max: 4 },
  latencycomp: { key: "items", max: 3 },
  config: { key: "lines", max: 6 },
  statemachine: { key: "states", max: 4 },
  architecture: { key: "nodes", max: 3 },
  decision: { key: "options", max: 3 },
  pitfalls: { key: "items", max: 5 },
};

/** Recursively strip banned dashes from every string leaf (v1.0 voice rule). */
function stripDashesDeep(v: any): void {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (typeof v[i] === "string") v[i] = v[i].replace(/\s*—\s*/g, ", ").replace(/–/g, "-");
      else stripDashesDeep(v[i]);
    }
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v)) {
      if (typeof v[k] === "string") v[k] = v[k].replace(/\s*—\s*/g, ", ").replace(/–/g, "-");
      else stripDashesDeep(v[k]);
    }
  }
}

/**
 * Mockups that are a dark device by design and stay dark on any surface (a
 * terminal window, a Cmd+K palette). Everything else either follows the surface
 * tokens or deliberately inverts against them (callout), so only these two
 * collide with a full-Ink slide.
 */
const ALWAYS_DARK_MOCKUPS = new Set(["terminal", "commandpalette"]);

/** Return a schema-valid mockup, or `undefined` to drop it (falls back to card). */
function repairMockup(m: any): any | undefined {
  if (!m || typeof m !== "object") return undefined;
  stripDashesDeep(m);
  const spec = MOCKUP_ARRAY_MAX[m.type];
  if (spec && Array.isArray(m[spec.key]) && m[spec.key].length > spec.max) {
    m[spec.key] = m[spec.key].slice(0, spec.max);
  }
  const res = mockupSchema.safeParse(m);
  return res.success ? res.data : undefined;
}

/**
 * Recover a cover anchor the model meant but could not express.
 *
 * Two shapes turn up whenever someone asks for an illustration on the cover, and both
 * used to end as an empty box. A cover carries `hook` and has no `mockup` field at all,
 * so a model reaching for the vocabulary it knows from point slides puts the illustration
 * under `mockup`, where zod strips it silently. And an illustration hook with no slugs
 * fails `.min(1)`, which drops the hook entirely and discards the request.
 *
 * Both are repaired towards what was asked rather than away from it: the mockup is folded
 * into a hook, and an empty slug list is filled with the fallback. The user sees an
 * illustration — the fallback one if the model named nothing usable, but an illustration.
 */
function repairCoverHook(s: any): void {
  // Illustration written as a point-slide mockup: the right intent, the wrong field.
  if (!s.hook && s.mockup?.type === "illustration") {
    s.hook = { kind: "illustration", ...s.mockup };
    delete s.hook.type;
  }
  // A cover has no mockup field; leaving it would only confuse the next reader.
  if (s.mockup !== undefined) delete s.mockup;

  if (!s.hook || s.hook.kind !== "illustration") return;

  const h = s.hook;
  const named: string[] = [
    ...(Array.isArray(h.illustrationSlugs) ? h.illustrationSlugs : []),
    h.illustrationSlug,
    h.slug,
  ].filter((v: unknown): v is string => typeof v === "string" && v.trim() !== "");

  delete h.illustrationSlug;
  delete h.slug;
  h.illustrationSlugs = named.length ? named.slice(0, 2) : [FALLBACK_ILLUSTRATION];
  if (!named.length) {
    console.warn("[cover-hook] illustration asked for with no slug — using the fallback.");
  }
}

/** Fixed shape from the prompt: "fyp" first, "vourdev" last, five in total. */
const HASHTAG_FLOOR = ["fyp", "backend", "coding", "developer", "vourdev"];

/**
 * Bring title/caption/hashtags up to something the schema will accept.
 *
 * These three leave the app verbatim — they are the Instagram and TikTok post
 * itself — so the schema requires them non-empty and requires exactly five tags.
 * Defaulting a missing one to "" or [] (which this used to do) now fails that
 * check, which would turn the salvage path into a second way to lose the deck.
 * Derive from the slides instead: a title taken from the cover is a worse title
 * than the model should have written, but it is a real one, and the deck ships.
 */
function repairPostFields(raw: any): void {
  const slides: any[] = Array.isArray(raw.slides) ? raw.slides : [];
  const cover = slides.find((s) => s?.role === "cover") ?? slides[0];

  if (typeof raw.title !== "string" || !raw.title.trim()) {
    raw.title = clampStr(cover?.headline || cover?.eyebrow || "Carousel @vourdev", 90);
  }

  if (typeof raw.caption !== "string" || !raw.caption.trim()) {
    const hook = cover?.lede || cover?.headline || raw.title;
    raw.caption = `${hook}\n\nSimpan biar nggak keulang di project kamu.`;
  }

  const tags: string[] = Array.isArray(raw.hashtags)
    ? raw.hashtags.filter((h: unknown): h is string => typeof h === "string" && h.trim() !== "")
    : [];
  // Keep what the model gave (deduped, "#"-stripped), then pad and trim to five.
  const seen = new Set<string>();
  const cleaned = tags
    .map((h) => h.trim().replace(/^#+/, "").toLowerCase())
    .filter((h) => h && !seen.has(h) && seen.add(h));
  for (const filler of HASHTAG_FLOOR) {
    if (cleaned.length >= 5) break;
    if (!seen.has(filler)) {
      cleaned.push(filler);
      seen.add(filler);
    }
  }
  raw.hashtags = cleaned.slice(0, 5);
}

/**
 * The per-slide half of `repairSlidePlan`, on its own so the scoped revision path can
 * use it too.
 *
 * It could not before, and that asymmetry was a real failure: generation and whole-plan
 * revision both parse through `repairSlidePlan`, while a scoped revision — the path every
 * chat revision takes — went straight to `slidePatchSchema.parse`. So a mockup that came
 * back one field short threw and lost the whole turn, where the same output would have
 * been salvaged on any other path. Measured against the live model on 25 Aug 2026: a
 * revision to a typed mockup died with `expected string, received undefined`.
 */
export function repairSlide(s: any): void {
  if (!s || typeof s !== "object") return;
  if (typeof s.headline === "string") {
    const fixed = hoistAccentMarkdown(s.headline, s.accentWord);
    s.headline = fixed.headline;
    if (fixed.accentWord !== undefined) s.accentWord = fixed.accentWord;
  }
  s.headline = clampStr(s.headline, 90);
  s.eyebrow = clampStr(s.eyebrow, 40);
  s.lede = clampStr(s.lede, 140);
  s.body = clampStr(s.body, 160);
  if (s.role === "point" && s.mockup !== undefined) {
    const fixed = repairMockup(s.mockup);
    if (fixed) s.mockup = fixed;
    else delete s.mockup; // fall back to auto-card in resolveMockup
  }
  // Drop an invented layout name rather than pinning it to "standard": an absent
  // layout is a signal the renderer acts on (it rotates one in), whereas writing
  // "standard" here is an instruction to stay flat. Coercing every miss to
  // "standard" made the model's silence indistinguishable from a real choice.
  if (
    s.role === "point" &&
    s.layout !== undefined &&
    !["standard", "mockup-forward", "split-content", "note-emphasis"].includes(s.layout)
  ) {
    delete s.layout;
  }
  // Surface/mockup collision. The prompt asks the model to keep a dark
  // device off a dark slide, but asking is not enforcing: a terminal on an
  // Ink slide is a near-black panel on a near-black canvas. Flip the slide
  // to Paper rather than dropping a mockup the deck needs — the surface is
  // rhythm, the mockup is content.
  if (
    s.role === "point" &&
    s.surface === "ink" &&
    s.mockup &&
    ALWAYS_DARK_MOCKUPS.has(s.mockup.type)
  ) {
    s.surface = "paper";
  }
  if (s.role === "outro" && s.cta && typeof s.cta === "object") {
    s.cta.strong = clampStr(s.cta.strong, 60);
    s.cta.sub = clampStr(s.cta.sub, 90);
  }
  if (s.role === "cover") {
    repairCoverHook(s);
    if (s.hook !== undefined) {
      const res = coverHookSchema.safeParse(s.hook);
      if (res.success) s.hook = res.data;
      else delete s.hook; // fall back to the hero cover template
    }
  }
}

export function repairSlidePlan(raw: any): SlidePlan {
  if (raw && typeof raw === "object") {
    repairPostFields(raw);

    if (Array.isArray(raw.slides)) {
      for (const s of raw.slides) {
        repairSlide(s);
      }
    }
  }
  // Final authority: genuinely unrecoverable input still throws here.
  return slidePlanSchema.parse(raw);
}
