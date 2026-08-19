import { describe, it, expect } from "vitest";
import { repairSlidePlan } from "@/lib/ds/repair";
import { renderSlide } from "@/lib/ds/render-slide";
import type { Slide } from "@/lib/ds/schema";

// A minimal valid point slide we can attach a (possibly broken) mockup to.
function pointWith(mockup: unknown) {
  return {
    role: "point",
    counter: "02 / 05",
    eyebrow: "WHY",
    headline: "It matters here",
    body: "because it does.",
    mockup,
  };
}

function planWith(mockup: unknown) {
  return { title: "t", caption: "", hashtags: [], slides: [pointWith(mockup)] };
}

/**
 * The unsalvageable mockup was dropped and the slide still renders.
 *
 * This used to assert the slide fell back to an auto-card. That card was built from the
 * slide's own eyebrow and body, so "recovered" meant "says the same sentence twice".
 * The recovery contract is now weaker and honest: the deck survives a bad mockup, and
 * the slide shows its copy without a fabricated diagram under it.
 */
function droppedTheMockup(slide: Slide): boolean {
  if (slide.role !== "point") return false;
  const html = renderSlide(slide);
  return slide.mockup === undefined && !html.includes('class="card ') && html.includes("<h1");
}

describe("repairSlidePlan — TASK-1 mockups never crash generation", () => {
  it("clamps an over-max foldertree (10 → 8 lines) and keeps it", () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({ text: `line ${i}` }));
    const plan = repairSlidePlan(planWith({ type: "foldertree", lines }));
    const s = plan.slides[0];
    expect(s.role).toBe("point");
    if (s.role !== "point") return;
    expect(s.mockup?.type).toBe("foldertree");
    if (s.mockup?.type !== "foldertree") return;
    expect(s.mockup.lines).toHaveLength(8);
  });

  it("drops a below-min foldertree (1 line) rather than throwing", () => {
    const plan = repairSlidePlan(planWith({ type: "foldertree", lines: [{ text: "app/" }] }));
    expect(droppedTheMockup(plan.slides[0])).toBe(true);
  });

  it("clamps an over-max commandpalette (7 → 5 rows)", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ icon: "rocket", label: `cmd ${i}` }));
    const plan = repairSlidePlan(planWith({ type: "commandpalette", query: "deploy", rows }));
    const s = plan.slides[0];
    if (s.role !== "point" || s.mockup?.type !== "commandpalette") throw new Error("unexpected");
    expect(s.mockup.rows).toHaveLength(5);
  });

  it("drops a database with over-long NESTED rows (nested is unclampable)", () => {
    // tables clamp cannot reach tables[].rows; the over-long inner array must fail
    // safeParse and drop the whole mockup rather than crash the deck.
    const bigRows = Array.from({ length: 6 }, (_, i) => ({ col: `c${i}`, type: "text" }));
    const plan = repairSlidePlan(
      planWith({
        type: "database",
        tables: [
          { name: "users", rows: bigRows },
          { name: "posts", rows: [{ col: "id", type: "uuid" }, { col: "user_id", type: "fk" }] },
        ],
        relation: "1 ─< ∞",
      })
    );
    expect(droppedTheMockup(plan.slides[0])).toBe(true);
  });

  it("clamps an over-max gitbranch main (8 → 6) and keeps it", () => {
    const main = Array.from({ length: 8 }, (_, i) => `c${i}`);
    const plan = repairSlidePlan(
      planWith({ type: "gitbranch", main, branch: { name: "feat/auth", at: 1 }, mergeLabel: "merge" })
    );
    const s = plan.slides[0];
    if (s.role !== "point" || s.mockup?.type !== "gitbranch") throw new Error("unexpected");
    expect(s.mockup.main).toHaveLength(6);
  });

  it("strips em-dashes inside a promptcard body (v1.0 voice rule)", () => {
    const plan = repairSlidePlan(
      planWith({ type: "promptcard", label: "COPY THIS", body: "review this — then push" })
    );
    const s = plan.slides[0];
    if (s.role !== "point" || s.mockup?.type !== "promptcard") throw new Error("unexpected");
    expect(s.mockup.body).not.toContain("—");
    expect(s.mockup.body).toContain("review this, then push");
  });

  it("applies schema defaults on repair (promptcard label, database relation, gitbranch mergeLabel)", () => {
    const plan = repairSlidePlan(planWith({ type: "promptcard", body: "just a body" }));
    const s = plan.slides[0];
    if (s.role !== "point" || s.mockup?.type !== "promptcard") throw new Error("unexpected");
    expect(s.mockup.label).toBe("COPY THIS");
  });

  it("passes a fully valid all-new-types deck through unchanged", () => {
    const raw = {
      title: "t",
      caption: "",
      hashtags: [],
      slides: [
        pointWith({ type: "promptcard", body: "steal me" }),
        pointWith({ type: "foldertree", lines: [{ text: "app/" }, { text: "page.tsx", active: true }, { text: "api/" }] }),
        pointWith({ type: "commandpalette", query: "k", rows: [{ icon: "rocket", label: "Deploy", active: true }, { icon: "git-branch", label: "Preview" }] }),
        pointWith({ type: "database", tables: [{ name: "users", rows: [{ col: "id", type: "uuid" }, { col: "email", type: "text" }] }, { name: "posts", rows: [{ col: "id", type: "uuid" }, { col: "user_id", type: "fk" }] }] }),
        pointWith({ type: "gitbranch", main: ["init", "feat"], branch: { name: "feat/x", at: 1 } }),
      ],
    };
    expect(() => repairSlidePlan(raw)).not.toThrow();
    const plan = repairSlidePlan(raw);
    expect(plan.slides.every((s) => s.role === "point" && s.mockup !== undefined)).toBe(true);
  });
});

describe("repairSlidePlan — cover hooks never crash generation", () => {
  it("drops a malformed badge hook (missing required role) to a hero cover", () => {
    const raw = {
      title: "t", caption: "", hashtags: [],
      slides: [{ role: "cover", eyebrow: "X", headline: "Y Bukan Z", accentWord: "Bukan",
        hook: { kind: "badge" /* role missing → invalid */ } }],
    };
    expect(() => repairSlidePlan(raw)).not.toThrow();
    const cover = repairSlidePlan(raw).slides[0];
    expect(cover.role).toBe("cover");
    if (cover.role !== "cover") return;
    expect(cover.hook).toBeUndefined();
  });

  it("keeps a valid nocgrid hook (all fields defaulted) untouched", () => {
    const raw = {
      title: "t", caption: "", hashtags: [],
      slides: [{ role: "cover", eyebrow: "R", headline: "Semua Mati", accentWord: "Mati",
        hook: { kind: "nocgrid" } }],
    };
    const cover = repairSlidePlan(raw).slides[0];
    if (cover.role !== "cover") throw new Error("unexpected");
    expect(cover.hook?.kind).toBe("nocgrid");
  });
});
