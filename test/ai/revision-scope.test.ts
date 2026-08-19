import { describe, it, expect } from "vitest";
import {
  parseRevisionScope,
  scopeFromClassifier,
  mergeScopedRevision,
  assertScopePreserved,
  scopedChangeSummary,
  describeScope,
  RevisionScopeViolation,
  type RevisionScope,
} from "@/lib/ai/revision-scope";
import type { SlidePlan, Slide } from "@/lib/ds/schema";

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
