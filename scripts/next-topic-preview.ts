/** Exactly what GET /automation/topic/next would hand out tonight, without claiming it. */
import { getFreshNewsTopic, getTopics, NEWS_FRESH_MS } from "../src/lib/topics/bank";
import { resolveOperatorUserId } from "../src/middleware/service-auth";

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user");

// Same order the route uses: fresh news, then approved, then idea.
let via = "berita segar";
let topic = await getFreshNewsTopic(userId, "carousel").catch(() => null);
if (!topic) {
  [topic] = await getTopics(userId, { status: "approved", limit: 1 });
  via = "approved";
}
if (!topic) {
  [topic] = await getTopics(userId, { status: "idea", limit: 1 });
  via = "idea";
}
console.log(`jendela berita segar: ${NEWS_FRESH_MS / 3_600_000} jam\n`);

if (!topic) {
  console.log("bank kosong");
} else {
  const age = Math.round((Date.now() - topic.createdAt) / 86_400_000);
  console.log(`akan diambil (lewat "${via}"):`);
  console.log(`  ${topic.title}`);
  console.log(`  prio=${topic.priority}  umur=${age} hari  kategori=${topic.category}  source=${topic.source ?? "-"}`);
  console.log(`  sumber berita: ${topic.sourceUrls?.length ?? 0}`);
}

console.log("\n5 teratas di antrean (prioritas DESC, terbaru DESC):");
for (const t of (await getTopics(userId, { status: "idea", limit: 5 }))) {
  const age = Math.round((Date.now() - t.createdAt) / 86_400_000);
  const src = t.sourceUrls?.length ? `${t.sourceUrls.length} sumber` : "—";
  console.log(`  prio ${String(t.priority).padStart(2)}  ${String(age).padStart(2)}h  ${src.padEnd(9)}  ${t.title.slice(0, 54)}`);
}
process.exit(0);
