/** Write one bank row to a JSON file in the exact shape /next-for-blog returns. */
import { getTopics } from "../src/lib/topics/bank";
import { resolveOperatorUserId } from "../src/middleware/service-auth";
import { writeFileSync } from "node:fs";

const out = process.argv[2];
const source = process.argv[3] ?? "news-discovery";
if (!out) throw new Error("usage: dump-topic.ts <out.json> [source]");

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user");
const topic = (await getTopics(userId, { limit: 300 })).find((t) => t.source === source);
if (!topic) throw new Error(`no topic with source="${source}"`);

writeFileSync(out, JSON.stringify({
  id: topic.id,
  title: topic.title,
  description: topic.description,
  category: topic.category,
  tags: topic.keywords,
  angle: topic.angle,
  sourceUrls: topic.sourceUrls,
  visualHint: topic.visualHint,
}, null, 2));
console.log(`wrote ${out}: ${topic.title}`);
process.exit(0);
