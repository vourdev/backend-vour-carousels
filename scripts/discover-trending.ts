/**
 * Run news discovery from the command line.
 *
 *   npx tsx --env-file-if-exists=.env scripts/discover-trending.ts --dry-run
 *   npx tsx --env-file-if-exists=.env scripts/discover-trending.ts --hours 72 --max 3
 *
 * Same code path the route and the cron use. `--dry-run` runs every gate and writes nothing.
 */
import { Kysely } from "kysely";
import { dialect } from "../src/lib/db";
import { defaultModel, resolveModel } from "../src/lib/ai/registry";
import { discoverTrendingTopics } from "../src/lib/news/discover";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function value(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const n = Number(process.argv[at + 1]);
  return Number.isFinite(n) ? n : fallback;
}

const db = new Kysely<any>({ dialect });
const user = await db.selectFrom("user").select("id").limit(1).executeTakeFirst();
if (!user?.id) throw new Error("No user in the database — run `npm run seed` first.");

const modelId = defaultModel();
if (!modelId) throw new Error("No OmniRoute model configured (OMNIROUTE_API_KEY / OMNIROUTE_BASE_URL).");
console.log(`model: ${modelId}   user: ${user.id}   dryRun: ${flag("dry-run")}\n`);

const result = await discoverTrendingTopics(resolveModel(modelId), {
  userId: user.id as string,
  withinHours: value("hours", 48),
  minSources: value("min-sources", 2),
  maxTopics: value("max", 3),
  useSearch: !flag("no-search"),
  dryRun: flag("dry-run"),
});

console.log("\nFEEDS");
for (const f of result.feeds) {
  console.log(`  ${f.ok ? "ok  " : "FAIL"} ${String(f.count).padStart(3)}  ${f.publisher}${f.detail ? "  — " + f.detail : ""}`);
}

if (result.search) {
  console.log(
    `\nSEARCH  ${result.search.model}: ${result.search.kept}/${result.search.returned} dipakai ` +
      `(${result.search.malformed} tidak valid, ${result.search.unreachable} URL mati)`
  );
} else {
  console.log("\nSEARCH  tidak aktif (NEWS_SEARCH_MODEL belum diset atau --no-search)");
}

console.log("\nSTATS", result.stats);

console.log(`\nSAVED (${result.saved.length})`);
for (const t of result.saved) {
  console.log(`\n  ${t.title}`);
  console.log(`    id=${t.id} category=${t.category} status=${t.status} blogStatus=${t.blogStatus}`);
  console.log(`    visualHint=${t.visualHint} priority=${t.priority} angle=${t.angle}`);
  console.log(`    keywords: ${t.keywords.join(", ")}`);
  console.log(`    why: ${t.targetAudienceFit}`);
  console.log(`    description: ${t.description}`);
  for (const u of t.sourceUrls ?? []) console.log(`    source: ${u}`);
}

console.log(`\nSKIPPED (${result.skipped.length})`);
const byReason = new Map<string, typeof result.skipped>();
for (const s of result.skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s]);
for (const [reason, list] of byReason) {
  console.log(`\n  ${reason} — ${list.length}`);
  for (const s of list.slice(0, 6)) console.log(`    "${s.headline}"\n      ${s.detail}`);
}
process.exit(0);
