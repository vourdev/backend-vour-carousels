/** The order GET /next-for-blog will hand topics out: priority DESC, created_at ASC. */
import { getTopics } from "../src/lib/topics/bank";
import { resolveOperatorUserId } from "../src/middleware/service-auth";

const userId = await resolveOperatorUserId();
if (!userId) throw new Error("no user");
const all = await getTopics(userId, { limit: 400 });
const queue = all
  .filter((t) => t.blogStatus === "not_used")
  .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

console.log(`${queue.length} topik menunggu blog\n`);
queue.slice(0, 8).forEach((t, i) => {
  const src = t.sourceUrls?.length ? `${t.sourceUrls.length} sumber` : "—";
  console.log(
    `${String(i + 1).padStart(2)}. prio ${String(t.priority).padStart(2)}  ${new Date(t.createdAt)
      .toISOString()
      .slice(0, 10)}  ${src.padEnd(9)}  ${t.title.slice(0, 58)}`
  );
});
process.exit(0);
