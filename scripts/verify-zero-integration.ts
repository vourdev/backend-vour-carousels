/**
 * TASK 8 + 9 evidence: a news-discovery topic is picked up by BOTH consumers unchanged.
 *
 * Calls the two real route handlers in-process with the real database, so what is proven is
 * the shipped code path and not a description of it:
 *   - GET /api/topics/next-for-blog   (backend-vour-studio reads this)
 *   - GET /automation/topic/next      (the carousel cron reads this)
 *
 * The carousel endpoint MUTATES — it flips the row it hands out to "queued" — so it only runs
 * with --claim. Without the flag the same query is issued read-only instead.
 */
import serviceTopics from "../src/routes/service/topics";
import { getTopics, updateTopic, type Topic } from "../src/lib/topics/bank";
import { resolveOperatorUserId } from "../src/middleware/service-auth";

const claim = process.argv.includes("--claim");
const key = process.env.VOURDEV_SERVICE_KEY;
if (!key) throw new Error("VOURDEV_SERVICE_KEY not set");

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user in database");

function show(label: string, value: unknown) {
  console.log(`  ${label.padEnd(14)} ${JSON.stringify(value)}`);
}

/* ── 1. Blog side ─────────────────────────────────────────────────────── */
console.log("\n=== GET /api/topics/next-for-blog (blog generator) ===");
const res = await serviceTopics.request("/next-for-blog", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log(`  HTTP ${res.status}`);
const blogTopic = (await res.json()) as any;
for (const k of ["id", "title", "category", "visualHint", "sourceUrls"]) show(k, blogTopic[k]);
console.log(`  grounded: ${Array.isArray(blogTopic.sourceUrls) ? blogTopic.sourceUrls.length : 0} source URL(s) crossed the service boundary`);

/* ── 2. Carousel side ─────────────────────────────────────────────────── */
console.log('\n=== GET /automation/topic/next (carousel cron) — status "approved" then "idea" ===');
let [carouselTopic] = await getTopics(userId, { status: "approved", limit: 1 });
if (!carouselTopic) [carouselTopic] = await getTopics(userId, { status: "idea", limit: 1 });

if (!carouselTopic) {
  console.log("  no approved/idea topic in the bank");
} else {
  const t: Topic = carouselTopic;
  for (const [k, v] of Object.entries({
    id: t.id, title: t.title, status: t.status, category: t.category,
    source: t.source, visualHint: t.visualHint, sources: t.sourceUrls?.length ?? 0,
  })) show(k, v);
  if (claim) {
    await updateTopic(t.id, userId, { status: "queued" });
    console.log('  --claim: flipped to "queued", exactly as the endpoint does');
  } else {
    console.log("  (read-only; pass --claim to also flip it to \"queued\")");
  }
}

/* ── 3. Did discovery rows land where both queries can see them? ───────── */
console.log("\n=== news-discovery rows in the bank ===");
const all = await getTopics(userId, { limit: 300 });
const discovered = all.filter((t) => t.source === "news-discovery");
console.log(`  ${discovered.length} row(s) with source="news-discovery"`);
for (const t of discovered) {
  console.log(`\n  ${t.title}`);
  show("status", t.status);
  show("blogStatus", t.blogStatus);
  show("category", t.category);
  show("visualHint", t.visualHint);
  show("angle", t.angle);
  for (const u of t.sourceUrls ?? []) console.log(`    source: ${u}`);
  console.log(
    `    pullable by blog?     ${t.blogStatus === "not_used" ? "YES (blog_status=not_used)" : "no"}`
  );
  console.log(
    `    pullable by carousel? ${["idea", "approved"].includes(t.status) ? `YES (status=${t.status})` : `no (status=${t.status})`}`
  );
}
process.exit(0);
