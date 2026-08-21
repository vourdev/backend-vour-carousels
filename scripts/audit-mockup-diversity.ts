/**
 * Audit script: prints mockup type and layout distribution from the carousels DB.
 *
 * Usage:
 *   npx tsx scripts/audit-mockup-diversity.ts
 *
 * Reads DATABASE_URL / DATABASE_AUTH_TOKEN from .env automatically via dotenv.
 * Prints two tables: mockup type frequency and layout frequency, sorted by count.
 */

import { createClient } from "@libsql/client";
import { config } from "dotenv";

config(); // load .env

const ALL_MOCKUP_TYPES = [
  "card", "terminal", "comparison", "steps", "callout", "bigstat",
  "flow", "hub", "concept", "checklist", "promptcard", "foldertree",
  "commandpalette", "database", "gitbranch", "browser", "quote",
  "datatable", "commandlist", "timeline", "screenshot", "custom", "illustration",
  "apirequest", "eventqueue", "latencycomp", "config", "statemachine", "architecture",
  "decision", "mythfact", "pitfalls",
];

const ALL_LAYOUTS = ["standard", "mockup-forward", "split-content", "note-emphasis"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Copy .env.example to .env and fill in Turso credentials.");
    process.exit(1);
  }

  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const res = await client.execute("SELECT slide_plan FROM carousels WHERE slide_plan IS NOT NULL");

  const mockupCounts: Record<string, number> = {};
  const layoutCounts: Record<string, number> = {};
  let totalMockupSlides = 0;
  let totalPointSlides = 0;
  let totalCarousels = 0;

  for (const row of res.rows) {
    try {
      const plan = JSON.parse(String(row.slide_plan));
      if (!plan || !Array.isArray(plan.slides)) continue;
      totalCarousels++;

      for (const slide of plan.slides) {
        if (slide.role !== "point") continue;
        totalPointSlides++;

        // Mockup type
        if (slide.mockup?.type) {
          const mType = slide.mockup.type;
          mockupCounts[mType] = (mockupCounts[mType] || 0) + 1;
          totalMockupSlides++;
        }

        // Layout
        const layout = slide.layout || "standard";
        layoutCounts[layout] = (layoutCounts[layout] || 0) + 1;
      }
    } catch {
      // skip unparseable
    }
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  MOCKUP DIVERSITY AUDIT`);
  console.log(`  ${totalCarousels} carousels · ${totalPointSlides} point slides`);
  console.log(`═══════════════════════════════════════════════════\n`);

  // Mockup type table
  console.log("  MOCKUP TYPE DISTRIBUTION:");
  console.log("  ─────────────────────────────────────────────────");
  const mockupRows = ALL_MOCKUP_TYPES
    .map(type => ({
      type,
      count: mockupCounts[type] || 0,
      pct: totalMockupSlides > 0 ? ((mockupCounts[type] || 0) / totalMockupSlides * 100).toFixed(1) : "0.0",
    }))
    .sort((a, b) => b.count - a.count);

  const usedTypes = mockupRows.filter(r => r.count > 0).length;
  const neverUsed = mockupRows.filter(r => r.count === 0).map(r => r.type);

  for (const r of mockupRows) {
    const bar = "█".repeat(Math.round(Number(r.pct) / 2));
    const pad = r.type.padEnd(16);
    const countPad = String(r.count).padStart(4);
    console.log(`  ${pad} ${countPad}  ${r.pct.padStart(5)}%  ${bar}`);
  }

  console.log(`\n  Used: ${usedTypes}/${ALL_MOCKUP_TYPES.length} types`);
  if (neverUsed.length > 0) {
    console.log(`  Never used: ${neverUsed.join(", ")}`);
  }

  // Layout table
  console.log(`\n  LAYOUT DISTRIBUTION:`);
  console.log("  ─────────────────────────────────────────────────");
  const layoutRows = ALL_LAYOUTS
    .map(layout => ({
      layout,
      count: layoutCounts[layout] || 0,
      pct: totalPointSlides > 0 ? ((layoutCounts[layout] || 0) / totalPointSlides * 100).toFixed(1) : "0.0",
    }))
    .sort((a, b) => b.count - a.count);

  for (const r of layoutRows) {
    const bar = "█".repeat(Math.round(Number(r.pct) / 2));
    const pad = r.layout.padEnd(16);
    const countPad = String(r.count).padStart(4);
    console.log(`  ${pad} ${countPad}  ${r.pct.padStart(5)}%  ${bar}`);
  }

  // Check for unknown layouts
  const knownSet = new Set(ALL_LAYOUTS);
  const unknowns = Object.keys(layoutCounts).filter(l => !knownSet.has(l));
  if (unknowns.length > 0) {
    console.log(`\n  ⚠ Unknown layouts found: ${unknowns.join(", ")}`);
  }

  console.log(`\n═══════════════════════════════════════════════════\n`);

  client.close();
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
