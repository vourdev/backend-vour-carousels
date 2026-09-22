/**
 * One-off: strip campaign parameters from `source_urls` already in the bank.
 *
 * Rows saved before `cleanUrl` existed carry InfoQ's `?utm_campaign=…` tail. Harmless, but a
 * citation should be the article's address and nothing else.
 */
import { getTopics, updateTopic } from "../src/lib/topics/bank";
import { cleanUrl } from "../src/lib/news/fetch-news";
import { resolveOperatorUserId } from "../src/middleware/service-auth";

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user in database");

const topics = await getTopics(userId, { limit: 500 });
let changed = 0;
for (const t of topics) {
  if (!t.sourceUrls?.length) continue;
  const cleaned = t.sourceUrls.map(cleanUrl);
  if (cleaned.join("|") === t.sourceUrls.join("|")) continue;
  await updateTopic(t.id, userId, { sourceUrls: cleaned });
  changed++;
  console.log(`cleaned ${t.id} — ${t.title}`);
  for (const u of cleaned) console.log(`  ${u}`);
}
console.log(`\n${changed} row(s) updated`);
process.exit(0);
