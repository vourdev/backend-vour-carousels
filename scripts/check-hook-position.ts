/**
 * Proves the hook rule holds for every point composition.
 *
 * The rule: eyebrow + headline are the HOOK — the reason a thumb stops — so at most
 * ONE content block may render above them, whichever layout the plan picked.
 *
 * This has to run in a browser. The compositions are pure CSS: `mockup-forward`
 * re-slots flex children with `order`, `split-content` places them on a grid. DOM order
 * is therefore not reading order, and a string assertion over the rendered HTML — which
 * is what test/ds/render-slide.test.ts can do — cannot see the difference. The bug this
 * script exists to catch shipped past a green suite twice for exactly that reason:
 * `.catatan` sat at order 0 (above the counter), was moved to the mockup's slot, and was
 * still ahead of the headline. Both times the markup was correct.
 *
 *   npm run check:layout            all note-bearing mockups
 *   npm run check:layout -- flow    one of them
 *
 * Needs a local Chromium (`npx playwright install chromium`); the Docker image already
 * ships one. Exits non-zero on the first violation so CI can gate on it.
 */
import { chromium } from "playwright";
import { assembleCarousel } from "../src/lib/ds/assemble.js";
import type { Mockup, Slide, SlidePlan } from "../src/lib/ds/schema.js";

const LAYOUTS = ["standard", "mockup-forward", "split-content", "note-emphasis"] as const;

/**
 * Every mockup type that emits `.catatan` as a SIBLING of `.diag-wrap`, i.e. as a direct
 * flex child of the section — the only ones whose note the layout rules can move.
 * `comparison` and `illustration` nest theirs inside the mockup, so it travels with it.
 *
 * Keep this in step with the `note` fields in schema.ts: a type added there without an
 * entry here is a type this check silently stops covering.
 */
const NOTE_MOCKUPS: Record<string, Mockup> = {
  flow: { type: "flow", steps: [{ label: "Query" }, { label: "Planner" }, { label: "Index" }], note: "Catatan penting" },
  concept: { type: "concept", parent: "Index", children: ["B-Tree", "Hash", "GIN"], note: "Catatan penting" },
  hub: { type: "hub", center: "Postgres", tools: [{ icon: "database", label: "B-Tree" }, { icon: "search", label: "Seq Scan" }], note: "Catatan penting" },
  checklist: { type: "checklist", items: ["Cek EXPLAIN", "Cek index", "Cek row count"], note: "Selalu ukur, jangan tebak" },
  browser: { type: "browser", url: "vour.dev", cards: [{ label: "p95", value: "12ms" }, { label: "rows", value: "1.2k" }], note: "Catatan penting" },
  commandlist: { type: "commandlist", rows: [{ cmd: "EXPLAIN", desc: "lihat rencana" }, { cmd: "ANALYZE", desc: "segarkan statistik" }], note: "Catatan penting" },
  latencycomp: { type: "latencycomp", items: [{ label: "cache", value: "0.2ms", percentage: 5 }, { label: "db", value: "15ms", percentage: 100 }], note: "Catatan penting" },
  decision: { type: "decision", question: "Index?", options: [{ name: "B-Tree", when: "range query" }, { name: "Hash", when: "equality" }], note: "Catatan penting" },
  pitfalls: { type: "pitfalls", items: [{ text: "SELECT * di hot path" }, { text: "Index tanpa ukur" }, { text: "OFFSET besar" }], note: "Catatan penting" },
};

/**
 * Reads back the visual top-to-bottom order of a section's direct children.
 *
 * Passed as source text rather than a function: tsx compiles named functions with an
 * esbuild `__name` helper that does not exist inside the page, and page.evaluate would
 * throw `ReferenceError: __name is not defined`.
 */
const READ_ORDER = `
  Array.from(document.querySelectorAll("section.slide-point")).map(function (s) {
    var label = function (el) {
      var c = el.className.toString();
      if (c.includes("counter")) return "counter";
      if (c.includes("eyebrow")) return "eyebrow";
      if (el.tagName === "H1") return "headline";
      if (c.includes("body-text")) return "body";
      if (c.includes("catatan")) return "catatan";
      if (c.includes("diag-wrap")) return "mockup";
      if (c.includes("card")) return "card";
      return el.tagName.toLowerCase() + "." + c;
    };
    return {
      layout: (s.className.match(/layout-[\\w-]+/) || ["layout-?"])[0],
      order: Array.from(s.children)
        .map(function (el) {
          var r = el.getBoundingClientRect();
          return { name: label(el), y: r.top, x: r.left };
        })
        // Reading order: top to bottom, then left to right for the grid composition.
        // 8px of slack so two blocks that share a row are ordered by column.
        .sort(function (a, b) { return Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x; })
        .map(function (e) { return e.name; }),
    };
  })
`;

function pointSlide(layout: (typeof LAYOUTS)[number], mockup: Mockup): Slide {
  return {
    role: "point",
    counter: "03 / 08",
    eyebrow: "PERFORMA",
    headline: "Selalu Validasi Pakai EXPLAIN",
    accentWord: "EXPLAIN",
    body: "Rencana eksekusi query lebih jujur daripada tebakan soal index.",
    layout,
    mockup,
  };
}

async function main() {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(NOTE_MOCKUPS);
  const missing = names.filter((n) => !NOTE_MOCKUPS[n]);
  if (missing.length) {
    console.error(`Unknown mockup type: ${missing.join(", ")}`);
    process.exit(2);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  let failures = 0;

  for (const name of names) {
    const plan = {
      title: "Hook position check",
      caption: "hook position check",
      hashtags: ["a", "b", "c", "d", "e"],
      slides: LAYOUTS.map((l) => pointSlide(l, NOTE_MOCKUPS[name])),
    } as SlidePlan;

    await page.setContent(assembleCarousel(plan), { waitUntil: "load" });
    const sections: Array<{ layout: string; order: string[] }> = await page.evaluate(READ_ORDER);

    for (const s of sections) {
      // The counter is deck chrome — a "03 / 08" stamp, not a block anyone reads as
      // content — and the eyebrow is half the hook, so neither spends the budget.
      const above = s.order
        .slice(0, s.order.indexOf("headline"))
        .filter((n) => n !== "counter" && n !== "eyebrow");
      const ok = above.length <= 1;
      if (!ok) failures++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${name.padEnd(12)} ${s.layout.padEnd(22)} above=${above.length}  ${s.order.join(" → ")}`
      );
    }
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\n${failures} composition(s) put more than one block above the headline.`);
    process.exit(1);
  }
  console.log(`\nAll ${names.length * LAYOUTS.length} compositions keep the hook in the first two blocks.`);
}

main();
