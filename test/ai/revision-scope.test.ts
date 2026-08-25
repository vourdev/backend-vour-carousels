import { describe, it, expect } from "vitest";
import {
  parseRevisionScope,
  parseAspects,
  scopeFromClassifier,
  mergeScopedRevision,
  assertScopePreserved,
  scopedChangeSummary,
  describeScope,
  RevisionScopeViolation,
  type RevisionScope,
} from "@/lib/ai/revision-scope";
import type { SlidePlan, Slide } from "@/lib/ds/schema";
import { MOCKUP_TYPES } from "@/lib/ds/schema";

const slide = (n: number): Slide => ({
  role: "point",
  counter: `0${n} / 08`,
  eyebrow: `E${n}`,
  headline: `Headline ${n}`,
  accentWord: `Headline`,
  body: `Body ${n}`,
  mockup: { type: "callout", icon: "zap", text: `Callout ${n}` },
});

const plan = (): SlidePlan => ({
  title: "Race Condition 101",
  caption: "Caption asli",
  hashtags: ["fyp", "backend", "nodejs", "database", "vourdev"],
  slides: [
    { role: "cover", eyebrow: "BACKEND", headline: "Race condition", accentWord: "Race" },
    slide(2),
    slide(3),
    slide(4),
    slide(5),
    { role: "outro", eyebrow: "TUTUP", headline: "Simpan ini", accentWord: "Simpan", cta: { strong: "Simpan" } },
  ],
});

const scoped = (slides: number[], globals: RevisionScope["globals"] = []): RevisionScope => ({
  slides,
  globals,
  resolved: true,
  source: "parsed",
});

describe("parseRevisionScope", () => {
  it("reads an explicit slide number", () => {
    const s = parseRevisionScope("perpendek headline slide 2", 6);
    expect(s.resolved).toBe(true);
    expect(s.slides).toEqual([1]);
    expect(s.globals).toEqual([]);
  });

  it("reads Indonesian ordinal forms", () => {
    expect(parseRevisionScope("ubah slide ke-4 dong", 6).slides).toEqual([3]);
    expect(parseRevisionScope("slide nomor 3 typo", 6).slides).toEqual([2]);
    expect(parseRevisionScope("halaman 5 kepanjangan", 6).slides).toEqual([4]);
  });

  it("maps cover and outro to first and last", () => {
    expect(parseRevisionScope("ganti headline cover", 6).slides).toEqual([0]);
    expect(parseRevisionScope("outro-nya kurang kuat", 6).slides).toEqual([5]);
  });

  it("collects several slides at once", () => {
    expect(parseRevisionScope("rapikan slide 2 dan slide 4", 6).slides).toEqual([1, 3]);
  });

  it("reads deck-level fields", () => {
    const s = parseRevisionScope("captionnya bikin lebih pendek", 6);
    expect(s.resolved).toBe(true);
    expect(s.globals).toEqual(["caption"]);
    expect(s.slides).toEqual([]);
    expect(parseRevisionScope("ganti judul jadi lebih spesifik", 6).globals).toEqual(["title"]);
    expect(parseRevisionScope("hashtag-nya ganti", 6).globals).toEqual(["hashtags"]);
  });

  it("combines a slide and a global in one request", () => {
    const s = parseRevisionScope("perbaiki slide 3 dan captionnya", 6);
    expect(s.slides).toEqual([2]);
    expect(s.globals).toEqual(["caption"]);
  });

  it("ignores a slide number that does not exist", () => {
    expect(parseRevisionScope("ubah slide 40", 6).resolved).toBe(false);
  });

  it("stays unresolved for structural requests", () => {
    for (const msg of ["hapus slide 5", "tambahkan slide baru soal testing", "urutkan slide ulang", "jadikan 10 slide"]) {
      const s = parseRevisionScope(msg, 6);
      expect(s.resolved, msg).toBe(false);
      expect(s.reasonCode, msg).toBe("structural");
    }
  });

  it("stays unresolved for deck-wide requests", () => {
    const s = parseRevisionScope("bikin semua headline lebih pendek", 6);
    expect(s.resolved).toBe(false);
    expect(s.reasonCode).toBe("deck-wide");
  });

  it("does NOT treat 'tambahkan illustration di slide 4' as structural", () => {
    // The whole point of the narrow structural regex: "tambah" only counts when a slide
    // is what is being added.
    const s = parseRevisionScope("tambahkan illustration di slide 4", 6);
    expect(s.resolved).toBe(true);
    expect(s.slides).toEqual([3]);
  });

  it("reports no-target when nothing is named, so the classifier can try", () => {
    const s = parseRevisionScope("bikin lebih nendang", 6);
    expect(s.resolved).toBe(false);
    expect(s.reasonCode).toBe("no-target");
  });
});

describe("scopeFromClassifier", () => {
  it("converts 1-based indices and drops out-of-range ones", () => {
    const s = scopeFromClassifier({ slides: [2, 99], globals: ["caption"] }, 6);
    expect(s.slides).toEqual([1]);
    expect(s.globals).toEqual(["caption"]);
    expect(s.source).toBe("classified");
  });

  it("honours wholeDeck", () => {
    expect(scopeFromClassifier({ wholeDeck: true, slides: [1] }, 6).resolved).toBe(false);
  });

  it("is unresolved when the classifier names nothing", () => {
    expect(scopeFromClassifier({ slides: [], globals: [] }, 6).resolved).toBe(false);
  });
});

describe("mergeScopedRevision", () => {
  it("replaces only the in-scope slide", () => {
    const before = plan();
    const patched: Slide = { ...slide(2), headline: "Pendek" };
    const after = mergeScopedRevision(before, { slides: [{ index: 1, slide: patched }] }, scoped([1]));

    expect(after.slides[1]).toEqual(patched);
    expect(after.slides[0]).toBe(before.slides[0]);
    expect(after.slides[2]).toBe(before.slides[2]);
    expect(after.title).toBe(before.title);
    expect(after.caption).toBe(before.caption);
    expect(after.hashtags).toBe(before.hashtags);
  });

  it("drops a slide the model returned that was not in scope", () => {
    const before = plan();
    const sneaky: Slide = { ...slide(5), headline: "Diam-diam diubah" };
    const after = mergeScopedRevision(
      before,
      { slides: [{ index: 1, slide: { ...slide(2), headline: "Pendek" } }, { index: 4, slide: sneaky }] },
      scoped([1])
    );
    expect(after.slides[4]).toBe(before.slides[4]);
  });

  it("ignores global fields the model returned but that were not in scope", () => {
    const before = plan();
    const after = mergeScopedRevision(
      before,
      { title: "Judul baru", caption: "Caption baru", slides: [] },
      scoped([], ["caption"])
    );
    expect(after.caption).toBe("Caption baru");
    expect(after.title).toBe(before.title);
  });
});

describe("assertScopePreserved", () => {
  it("passes when only in-scope data moved", () => {
    const before = plan();
    const after = mergeScopedRevision(
      before,
      { slides: [{ index: 1, slide: { ...slide(2), headline: "Pendek" } }] },
      scoped([1])
    );
    expect(() => assertScopePreserved(before, after, scoped([1]))).not.toThrow();
  });

  it("throws with detail when an out-of-scope slide changed", () => {
    const before = plan();
    const after: SlidePlan = { ...before, slides: before.slides.map((s, i) => (i === 4 ? slide(99) : s)) };
    try {
      assertScopePreserved(before, after, scoped([1]));
      throw new Error("expected a violation");
    } catch (err) {
      expect(err).toBeInstanceOf(RevisionScopeViolation);
      expect((err as RevisionScopeViolation).violations).toContain("slide 5 changed");
    }
  });

  it("catches a silently rewritten caption", () => {
    const before = plan();
    const after: SlidePlan = { ...before, caption: "Caption yang tidak diminta" };
    expect(() => assertScopePreserved(before, after, scoped([1]))).toThrow(RevisionScopeViolation);
  });

  it("catches a changed slide count", () => {
    const before = plan();
    const after: SlidePlan = { ...before, slides: before.slides.slice(0, 5) };
    expect(() => assertScopePreserved(before, after, scoped([1]))).toThrow(/slide count: 6 -> 5/);
  });

  it("stands down for an unresolved scope", () => {
    const before = plan();
    const after: SlidePlan = { ...before, title: "apa saja", caption: "beda" };
    const unscoped: RevisionScope = { slides: [], globals: [], resolved: false, source: "unscoped" };
    expect(() => assertScopePreserved(before, after, unscoped)).not.toThrow();
  });
});

describe("scopedChangeSummary", () => {
  it("is empty when the model returned the slide unchanged", () => {
    const before = plan();
    const after = mergeScopedRevision(before, { slides: [{ index: 1, slide: before.slides[1] }] }, scoped([1]));
    expect(scopedChangeSummary(before, after, scoped([1]))).toEqual([]);
  });

  it("names what changed", () => {
    const before = plan();
    const after = mergeScopedRevision(
      before,
      { slides: [{ index: 1, slide: { ...slide(2), headline: "X" } }], caption: "C2" },
      scoped([1], ["caption"])
    );
    expect(scopedChangeSummary(before, after, scoped([1], ["caption"]))).toEqual(["slide 2", "caption"]);
  });
});

describe("describeScope", () => {
  it("renders 1-based slides and globals", () => {
    expect(describeScope(scoped([1, 3], ["caption"]))).toBe("slide 2, 4 + caption");
  });
});

/* ── Aspect scoping ───────────────────────────────────────────────────────────
 * Naming the slide was never enough: the model is handed one slide and returns one
 * slide, so a reword came back carrying a new layout and a new mockup. */

describe("parseAspects", () => {
  it("treats a plain wording change as copy only", () => {
    expect(parseAspects("di slide 5 ganti kata payload jadi muatan")).toEqual(["copy"]);
    expect(parseAspects("perpendek headline slide 3")).toEqual(["copy"]);
  });

  it("puts layout in play when the request is about the composition", () => {
    expect(parseAspects("slide 5 bikin full width")).toContain("layout");
    expect(parseAspects("ubah tata letak slide 2")).toContain("layout");
    expect(parseAspects("slide 4 jadikan dua kolom")).toContain("layout");
  });

  it("puts mockup in play when the request names a visual", () => {
    expect(parseAspects("ganti mockup slide 4 jadi illustration")).toContain("mockup");
    expect(parseAspects("slide 6 pakai diagram aja")).toContain("mockup");
  });

  it("puts surface in play when the request is about the canvas", () => {
    expect(parseAspects("slide 3 bikin gelap")).toContain("surface");
  });

  it("always keeps copy, so a visual request cannot drop a wording change with it", () => {
    expect(parseAspects("ganti mockup slide 4 dan perpendek headline-nya")).toContain("copy");
  });
});

describe("mergeScopedRevision aspect filtering", () => {
  const withAspects = (slides: number[], aspects: RevisionScope["aspects"]): RevisionScope => ({
    slides,
    globals: [],
    aspects,
    resolved: true,
    source: "parsed",
  });

  /** What a model actually returns for "ganti satu kata": the whole slide, redecorated. */
  const overreaching: Slide = {
    role: "point",
    counter: "02 / 08",
    eyebrow: "E2",
    headline: "Headline 2 yang sudah diubah",
    accentWord: "diubah",
    body: "Body 2",
    surface: "ink",
    layout: "split-content",
    mockup: { type: "checklist", items: ["a", "b"] },
  };

  it("takes the copy and leaves the composition alone", () => {
    const before = plan();
    const after = mergeScopedRevision(
      before,
      { slides: [{ index: 1, slide: overreaching }] },
      withAspects([1], ["copy"])
    );
    const s = after.slides[1] as Extract<Slide, { role: "point" }>;

    expect(s.headline).toBe("Headline 2 yang sudah diubah");
    expect(s.mockup).toEqual({ type: "callout", icon: "zap", text: "Callout 2" });
    expect(s.layout).toBeUndefined();
    expect(s.surface).toBeUndefined();
  });

  it("takes the layout too when the request asked for it, still not the mockup", () => {
    const after = mergeScopedRevision(
      plan(),
      { slides: [{ index: 1, slide: overreaching }] },
      withAspects([1], ["copy", "layout"])
    );
    const s = after.slides[1] as Extract<Slide, { role: "point" }>;

    expect(s.layout).toBe("split-content");
    expect(s.mockup).toEqual({ type: "callout", icon: "zap", text: "Callout 2" });
  });

  it("takes the mockup when the request asked for it, still not the layout", () => {
    const after = mergeScopedRevision(
      plan(),
      { slides: [{ index: 1, slide: overreaching }] },
      withAspects([1], ["copy", "mockup"])
    );
    const s = after.slides[1] as Extract<Slide, { role: "point" }>;

    expect(s.mockup).toEqual({ type: "checklist", items: ["a", "b"] });
    expect(s.layout).toBeUndefined();
  });

  it("never lets the model change what kind of slide this is", () => {
    const after = mergeScopedRevision(
      plan(),
      { slides: [{ index: 1, slide: { ...overreaching, role: "outro" } as Slide }] },
      withAspects([1], ["copy"])
    );
    expect(after.slides[1].role).toBe("point");
  });

  it("honours an omission inside an in-scope aspect", () => {
    const { accentWord: _drop, ...withoutAccent } = overreaching as Record<string, unknown>;
    const after = mergeScopedRevision(
      plan(),
      { slides: [{ index: 1, slide: withoutAccent as Slide }] },
      withAspects([1], ["copy"])
    );
    expect((after.slides[1] as Record<string, unknown>).accentWord).toBeUndefined();
  });

  it("still replaces everything when no aspects are given", () => {
    const after = mergeScopedRevision(
      plan(),
      { slides: [{ index: 1, slide: overreaching }] },
      scoped([1])
    );
    expect((after.slides[1] as Extract<Slide, { role: "point" }>).mockup).toEqual({
      type: "checklist",
      items: ["a", "b"],
    });
  });

  it("is caught by the guard if a caller merges by hand and gets it wrong", () => {
    const before = plan();
    const after = { ...before, slides: before.slides.map((s, i) => (i === 1 ? overreaching : s)) };
    expect(() => assertScopePreserved(before, after, withAspects([1], ["copy"]))).toThrow(
      RevisionScopeViolation
    );
  });
});

/**
 * The mockup aspect was matched against a hand-written word list that held eight of the
 * thirty-two type names. So "ganti slide 6 jadi pitfalls" never registered as a mockup
 * request: the aspect stayed out of scope, the model's new mockup was discarded as drift,
 * and the slide came back unchanged — which looked like the model ignoring the user.
 * Measured live: the same request with the word "mockup" in it worked every time.
 */
describe("naming a mockup type is naming the mockup", () => {

  it.each(MOCKUP_TYPES)("recognises a change to %s", (type) => {
    expect(parseAspects(`ganti slide 3 jadi ${type}`)).toContain("mockup");
  });

  it.each([
    "slide 6 ganti jadi pitfalls",
    "bikin slide 3 pakai datatable",
    "ubah slide 4 jadi mythfact",
    "slide 5 gunakan custom mockup",
    "make slide 2 a timeline",
  ])("puts the mockup in scope for %s", (msg) => {
    expect(parseAspects(msg)).toContain("mockup");
  });

  /**
   * Several type names are ordinary words. A copy edit that merely mentions one must not
   * reopen the mockup for rewriting — that is the drift this guard exists to prevent.
   */
  it.each([
    "perbaiki headline slide 2 biar lebih tajam",
    "tulis ulang body slide 3, sebutkan database-nya",
    "bikin caption lebih pendek",
    "headline slide 4 sebut soal config yang salah",
  ])("leaves the mockup alone for %s", (msg) => {
    expect(parseAspects(msg)).not.toContain("mockup");
  });
});
