import { describe, it, expect } from "vitest";
import {
  splitBrief,
  joinBrief,
  briefTargets,
  mergeBriefSections,
  briefScopeViolations,
} from "@/lib/ai/brief-sections";
import { parseRevisionScope } from "@/lib/ai/revision-scope";

const BRIEF = `# Carousel Content — Race Condition di Node.js

## Content Info
Topik: race condition

# Slide 1 — Cover

## Headline
Race condition bikin data korup

# Slide 2 — Problem

## Headline
Dua request baca nilai yang sama

## Description
Keduanya baca saldo 100 sebelum salah satunya nulis.

# Slide 3 — Outro

## Headline
Simpan biar nggak lupa

# Caption
Caption asli yang panjang.

# Hashtag
fyp, backend, nodejs, database, vourdev
`;

describe("splitBrief / joinBrief", () => {
  it("round-trips byte-for-byte", () => {
    expect(joinBrief(splitBrief(BRIEF))).toBe(BRIEF);
  });

  it("classifies every section", () => {
    const kinds = splitBrief(BRIEF).map((s) => s.kind);
    expect(kinds).toEqual(["header", "slide", "slide", "slide", "caption", "hashtag"]);
  });

  it("numbers slides from their heading", () => {
    const slides = splitBrief(BRIEF).filter((s) => s.kind === "slide");
    expect(slides.map((s) => s.slideNumber)).toEqual([1, 2, 3]);
  });

  it("keeps an unstructured document in one piece", () => {
    expect(joinBrief(splitBrief("just some text"))).toBe("just some text");
  });
});

describe("briefTargets", () => {
  const sections = splitBrief(BRIEF);

  it("finds the section for a slide request", () => {
    const scope = parseRevisionScope("perpendek headline slide 2", 3);
    expect(briefTargets(sections, scope).map((i) => sections[i].kind)).toEqual(["slide"]);
    expect(sections[briefTargets(sections, scope)[0]].slideNumber).toBe(2);
  });

  it("finds the caption and hashtag sections", () => {
    expect(briefTargets(sections, { slides: [], globals: ["caption"] }).length).toBe(1);
    expect(briefTargets(sections, { slides: [], globals: ["hashtags"] }).length).toBe(1);
    expect(briefTargets(sections, { slides: [], globals: ["title"] }).length).toBe(1);
  });
});

describe("mergeBriefSections", () => {
  const sections = splitBrief(BRIEF);

  it("splices one section and leaves the rest byte-identical", () => {
    const targets = briefTargets(sections, { slides: [1], globals: [] });
    const rewritten = `# Slide 2 — Problem

## Headline
Dua request, satu saldo

## Description
Keduanya baca saldo 100 sebelum salah satunya nulis.
`;
    const out = mergeBriefSections(sections, targets, rewritten);
    expect(out.applied).toEqual(targets);
    expect(out.brief).toContain("Dua request, satu saldo");
    expect(out.brief).toContain("Caption asli yang panjang.");
    expect(briefScopeViolations(sections, out.brief, out.applied)).toEqual([]);
  });

  it("matches on the stable part of the heading, so a retitled slide still lands", () => {
    const targets = briefTargets(sections, { slides: [1], globals: [] });
    const out = mergeBriefSections(sections, targets, `# Slide 2 — Judul baru\n\n## Headline\nBaru\n`);
    expect(out.applied).toEqual(targets);
    expect(out.brief).toContain("# Slide 2 — Judul baru");
  });

  it("drops a section the model invented", () => {
    const targets = briefTargets(sections, { slides: [1], globals: [] });
    const out = mergeBriefSections(
      sections,
      targets,
      `# Slide 2 — Problem\n\n## Headline\nBaru\n\n# Slide 9 — Bonus\n\nisi\n`
    );
    expect(out.brief).not.toContain("Slide 9");
    expect(splitBrief(out.brief).length).toBe(sections.length);
  });

  it("reports a target the model failed to return", () => {
    const targets = briefTargets(sections, { slides: [1], globals: [] });
    const out = mergeBriefSections(sections, targets, `# Caption\nsomething else\n`);
    expect(out.applied).toEqual([]);
    expect(out.missing.length).toBe(1);
  });
});

describe("briefScopeViolations", () => {
  const sections = splitBrief(BRIEF);

  it("names an out-of-scope section that changed", () => {
    const tampered = BRIEF.replace("Caption asli yang panjang.", "Caption yang tidak diminta.");
    expect(briefScopeViolations(sections, tampered, [2])).toEqual(["# Caption"]);
  });

  it("flags a dropped section", () => {
    const truncated = BRIEF.slice(0, BRIEF.indexOf("# Caption"));
    expect(briefScopeViolations(sections, truncated, [2])[0]).toMatch(/section count/);
  });
});
