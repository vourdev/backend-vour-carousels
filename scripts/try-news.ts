import { fetchNewsItems } from "../src/lib/news/fetch-news";
import { clusterStories, splitByCorroboration } from "../src/lib/news/corroborate";

const hours = Number(process.argv[2] ?? 48);

const { items, feeds } = await fetchNewsItems({ withinHours: hours });
console.log(`\nFEEDS (${hours}h window)`);
for (const f of feeds) {
  console.log(`  ${f.ok ? "ok  " : "FAIL"} ${String(f.count).padStart(3)}  ${f.publisher}${f.detail ? "  — " + f.detail : ""}`);
}
console.log(`\n${items.length} items total`);

const clusters = clusterStories(items);
const { passed, rejected } = splitByCorroboration(clusters, 2);
console.log(`${clusters.length} clusters → ${passed.length} corroborated, ${rejected.length} single-source\n`);

console.log("=== CORROBORATED ===");
for (const c of passed.slice(0, 12)) {
  console.log(`\n[${c.groups.length} sources: ${c.publishers.join(", ")}]`);
  console.log(`  ${c.headline}`);
  for (const u of c.sourceUrls) console.log(`    ${u}`);
}

console.log("\n=== SINGLE-SOURCE (dropped), first 8 ===");
for (const c of rejected.slice(0, 8)) {
  console.log(`  [${c.publishers[0]}] ${c.headline}`);
}
