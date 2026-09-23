/** Print the news-discovery rows in the bank, newest first, with their provenance. */
import { getTopics } from "../src/lib/topics/bank";
import { resolveOperatorUserId } from "../src/middleware/service-auth";

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user");
const rows = (await getTopics(userId, { limit: 400 })).filter((t) => t.source === "news-discovery");
rows.sort((a, b) => b.createdAt - a.createdAt);

for (const t of rows.slice(0, 5)) {
  console.log(`\n${t.title}`);
  console.log(`  dibuat ${new Date(t.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC`);
  console.log(`  status=${t.status}  blog=${t.blogStatus}  prio=${t.priority}  visual=${t.visualHint}`);
  console.log(`  angle : ${t.angle}`);
  console.log(`  why   : ${(t.targetAudienceFit ?? "").slice(0, 110)}`);
  for (const u of t.sourceUrls ?? []) console.log(`  src   : ${u}`);
}
console.log(`\ntotal news-discovery di bank: ${rows.length}`);
process.exit(0);
