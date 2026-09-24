import { createClient } from "@libsql/client";

let clientInstance: ReturnType<typeof createClient> | null = null;

function db() {
  if (!clientInstance) {
    clientInstance = createClient({
      url: process.env.DATABASE_URL ?? "file:local-auth.db",
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return clientInstance;
}

export type TopicCategory = 
  | "ai-workflow"
  | "developer-tools"
  | "automation"
  | "nextjs"
  | "angular"
  | "productivity"
  | "tutorial"
  | "common-mistakes"
  | "case-study"
  | "deep-dive"
  // Research agent categories
  | "evergreen"
  | "trending"
  | "personal"
  | "product";

export type TopicStatus = "idea" | "queued" | "generated" | "published" | "archived"
  // Research agent statuses
  | "pending_review" | "approved" | "rejected";

export type BlogStatus = "not_used" | "generating" | "published" | "failed";

/**
 * Which picture a topic from news discovery should be drawn with.
 *
 * Never a photograph from the article it came from. "changelog" means a structured
 * release — a version with a list of what changed — and "illustration" means everything
 * narrative. See lib/news/discover.ts and the RELEASE row in lib/ai/prompts.ts.
 */
export type VisualHint = "changelog" | "illustration";

export interface Topic {
  id: string;
  title: string;
  category: TopicCategory;
  description?: string;
  keywords: string[];
  angle?: string;
  status: TopicStatus;
  blogStatus: BlogStatus;
  priority: number;
  scheduledDate?: string;
  carouselId?: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  // Research agent fields
  source?: string;
  relatedProductId?: string;
  targetAudienceFit?: string;
  suggestedAngle?: string;
  /**
   * Where the claim came from, for grounding the article and deck that get written from it.
   * Text URLs only — no image is ever taken from these pages.
   */
  sourceUrls?: string[];
  visualHint?: VisualHint;
}

const TOPICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  keywords TEXT NOT NULL,
  angle TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  blog_status TEXT NOT NULL DEFAULT 'not_used',
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_date TEXT,
  carousel_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
)`;

let schemaEnsured = false;

/** Columns added by migrations. ALTER TABLE ADD COLUMN is a no-op if the column already exists in SQLite. */
const MIGRATION_COLUMNS = [
  "source TEXT",
  "related_product_id TEXT",
  "target_audience_fit TEXT",
  "suggested_angle TEXT",
  "blog_status TEXT NOT NULL DEFAULT 'not_used'",
  "source_urls TEXT",
  "visual_hint TEXT",
];

async function ensureSchema() {
  if (schemaEnsured) return;
  await db().execute(TOPICS_SCHEMA);

  // Add migration columns to existing tables (idempotent — errors on
  // "duplicate column" are swallowed so this runs safely every boot).
  for (const col of MIGRATION_COLUMNS) {
    try {
      await db().execute(`ALTER TABLE topics ADD COLUMN ${col}`);
    } catch {
      // column already exists — expected on every boot after the first migration
    }
  }

  schemaEnsured = true;
}

/**
 * `?? undefined` on every nullable column, because libsql hands back `null` and the
 * Topic interface promises `string | undefined`.
 *
 * The casts hid that: a caller written against the type — `if (t.relatedProductId !==
 * undefined)`, or JSON that is supposed to omit an absent key — saw `null` and took the
 * wrong branch. Making the runtime match the declared contract is the fix; widening the
 * type to `string | null | undefined` would only spread the check to every reader.
 */
function rowToTopic(row: any): Topic {
  const str = (v: unknown): string | undefined => (v == null ? undefined : (v as string));
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    category: row.category as TopicCategory,
    description: str(row.description),
    keywords: JSON.parse((row.keywords as string) || "[]"),
    angle: str(row.angle),
    status: row.status as TopicStatus,
    blogStatus: (row.blog_status as BlogStatus) || "not_used",
    priority: row.priority as number,
    scheduledDate: str(row.scheduled_date),
    carouselId: str(row.carousel_id),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    // Research agent fields
    source: str(row.source),
    relatedProductId: str(row.related_product_id),
    targetAudienceFit: str(row.target_audience_fit),
    suggestedAngle: str(row.suggested_angle),
    sourceUrls: parseUrlList(row.source_urls),
    visualHint: str(row.visual_hint) as VisualHint | undefined,
  };
}

/**
 * `source_urls` holds a JSON array. A row written before the column existed holds NULL, and a
 * row written by hand could hold anything; either way a reader asking "where did this come
 * from" must get an answer it can iterate, not a crash. Absent stays `undefined` rather than
 * `[]`, so "no sources recorded" and "recorded as none" remain distinguishable.
 */
function parseUrlList(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return undefined;
    const urls = parsed.map((u) => String(u)).filter((u) => /^https?:\/\//i.test(u));
    return urls.length ? urls : undefined;
  } catch {
    return undefined;
  }
}

export async function createTopic(data: {
  userId: string;
  title: string;
  category: TopicCategory;
  description?: string;
  keywords?: string[];
  angle?: string;
  priority?: number;
  scheduledDate?: string;
  /** Override the default "idea" status (e.g. "pending_review" for research agent topics). */
  status?: TopicStatus;
  blogStatus?: BlogStatus;
  blog_status?: BlogStatus;
  source?: string;
  relatedProductId?: string;
  related_product_id?: string;
  targetAudienceFit?: string;
  target_audience_fit?: string;
  suggestedAngle?: string;
  suggested_angle?: string;
  sourceUrls?: string[];
  source_urls?: string[];
  visualHint?: VisualHint;
  visual_hint?: VisualHint;
}): Promise<Topic> {
  await ensureSchema();
  const now = Date.now();
  const id = `topic_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const relProdId = data.relatedProductId ?? data.related_product_id ?? null;
  const audFit = data.targetAudienceFit ?? data.target_audience_fit ?? null;
  const sugAngle = data.suggestedAngle ?? data.suggested_angle ?? null;
  const blogSt = data.blogStatus ?? data.blog_status ?? "not_used";
  const srcUrls = data.sourceUrls ?? data.source_urls;
  const visual = data.visualHint ?? data.visual_hint ?? null;
  
  await db().execute({
    sql: `INSERT INTO topics (id, user_id, title, category, description, keywords, angle, status, blog_status, priority, scheduled_date, source, related_product_id, target_audience_fit, suggested_angle, source_urls, visual_hint, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.userId,
      data.title,
      data.category,
      data.description || null,
      JSON.stringify(data.keywords || []),
      data.angle || null,
      data.status || "idea",
      blogSt,
      data.priority || 0,
      data.scheduledDate || null,
      data.source || null,
      relProdId,
      audFit,
      sugAngle,
      srcUrls && srcUrls.length ? JSON.stringify(srcUrls) : null,
      visual,
      now,
      now,
    ],
  });

  const res = await db().execute({
    sql: `SELECT * FROM topics WHERE id = ?`,
    args: [id],
  });

  if (!res.rows[0]) throw new Error("Failed to create topic");
  return rowToTopic(res.rows[0]);
}

export async function updateTopic(
  id: string,
  userId: string,
  data: {
    title?: string;
    category?: TopicCategory;
    description?: string;
    keywords?: string[];
    angle?: string;
    status?: TopicStatus;
    blogStatus?: BlogStatus;
    blog_status?: BlogStatus;
    priority?: number;
    scheduledDate?: string;
    carouselId?: string;
    source?: string;
    relatedProductId?: string | null;
    related_product_id?: string | null;
    targetAudienceFit?: string | null;
    target_audience_fit?: string | null;
    suggestedAngle?: string | null;
    suggested_angle?: string | null;
    sourceUrls?: string[] | null;
    source_urls?: string[] | null;
    visualHint?: VisualHint | null;
    visual_hint?: VisualHint | null;
  }
): Promise<void> {
  await ensureSchema();
  const updates: string[] = [];
  const args: any[] = [];

  if (data.title !== undefined) {
    updates.push("title = ?");
    args.push(data.title);
  }
  if (data.category !== undefined) {
    updates.push("category = ?");
    args.push(data.category);
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    args.push(data.description);
  }
  if (data.keywords !== undefined) {
    updates.push("keywords = ?");
    args.push(JSON.stringify(data.keywords));
  }
  if (data.angle !== undefined) {
    updates.push("angle = ?");
    args.push(data.angle);
  }
  if (data.status !== undefined) {
    updates.push("status = ?");
    args.push(data.status);
  }
  if (data.blogStatus !== undefined || data.blog_status !== undefined) {
    updates.push("blog_status = ?");
    args.push(data.blogStatus ?? data.blog_status);
  }
  if (data.priority !== undefined) {
    updates.push("priority = ?");
    args.push(data.priority);
  }
  if (data.scheduledDate !== undefined) {
    updates.push("scheduled_date = ?");
    args.push(data.scheduledDate);
  }
  if (data.carouselId !== undefined) {
    updates.push("carousel_id = ?");
    args.push(data.carouselId);
  }
  if (data.source !== undefined) {
    updates.push("source = ?");
    args.push(data.source);
  }
  if (data.relatedProductId !== undefined || data.related_product_id !== undefined) {
    updates.push("related_product_id = ?");
    args.push(data.relatedProductId ?? data.related_product_id ?? null);
  }
  if (data.targetAudienceFit !== undefined || data.target_audience_fit !== undefined) {
    updates.push("target_audience_fit = ?");
    args.push(data.targetAudienceFit ?? data.target_audience_fit ?? null);
  }
  if (data.suggestedAngle !== undefined || data.suggested_angle !== undefined) {
    updates.push("suggested_angle = ?");
    args.push(data.suggestedAngle ?? data.suggested_angle ?? null);
  }

  if (data.sourceUrls !== undefined || data.source_urls !== undefined) {
    const list = data.sourceUrls ?? data.source_urls;
    updates.push("source_urls = ?");
    args.push(list && list.length ? JSON.stringify(list) : null);
  }
  if (data.visualHint !== undefined || data.visual_hint !== undefined) {
    updates.push("visual_hint = ?");
    args.push(data.visualHint ?? data.visual_hint ?? null);
  }

  updates.push("updated_at = ?");
  args.push(Date.now());

  args.push(id, userId);

  await db().execute({
    sql: `UPDATE topics SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
    args,
  });
}


export async function getTopics(
  userId: string,
  filters?: {
    status?: TopicStatus;
    blogStatus?: BlogStatus;
    category?: TopicCategory;
    limit?: number;
  }
): Promise<Topic[]> {
  await ensureSchema();
  
  let sql = `SELECT * FROM topics WHERE user_id = ?`;
  const args: any[] = [userId];

  if (filters?.status) {
    sql += ` AND status = ?`;
    args.push(filters.status);
  }

  if (filters?.blogStatus) {
    sql += ` AND blog_status = ?`;
    args.push(filters.blogStatus);
  }

  if (filters?.category) {
    sql += ` AND category = ?`;
    args.push(filters.category);
  }

  sql += ` ORDER BY priority DESC, created_at DESC`;

  if (filters?.limit) {
    sql += ` LIMIT ?`;
    args.push(filters.limit);
  }

  const res = await db().execute({ sql, args });
  return res.rows.map(rowToTopic);
}

/**
 * How long a news story is still news.
 *
 * News is perishable in a way the rest of the bank is not: a 0-day write-up published three
 * weeks after the patch is worthless, while "RAG vs fine-tuning" is as good next month as it
 * is today. The normal queue cannot express that — it orders by priority, so an evergreen
 * topic rated 10 beats a story that broke this morning rated 9, and the story ages out of
 * relevance while it waits its turn.
 *
 * So a corroborated story jumps the queue for three days, and then stops being special and
 * takes its place by priority like everything else.
 */
export const NEWS_FRESH_MS = 72 * 60 * 60 * 1000;

/**
 * The newest unconsumed news-discovery topic, if one is still fresh.
 *
 * `for` decides what "unconsumed" means, because the two consumers track it differently: the
 * carousel moves `status` along, the blog moves `blog_status`.
 */
export async function getFreshNewsTopic(
  userId: string,
  target: "blog" | "carousel",
  maxAgeMs: number = NEWS_FRESH_MS
): Promise<Topic | null> {
  await ensureSchema();

  const unconsumed =
    target === "blog"
      ? `(blog_status = 'not_used' OR blog_status IS NULL)`
      : `status IN ('idea', 'approved')`;

  const res = await db().execute({
    sql: `SELECT * FROM topics
          WHERE user_id = ?
            AND source = 'news-discovery'
            AND source_urls IS NOT NULL
            AND created_at >= ?
            AND ${unconsumed}
          -- Priority leads, recency breaks the tie. Ordering by time first made the choice
          -- between two stories from the same sweep come down to milliseconds.
          ORDER BY priority DESC, created_at DESC
          LIMIT 1`,
    args: [userId, Date.now() - maxAgeMs],
  });

  return res.rows[0] ? rowToTopic(res.rows[0]) : null;
}

/**
 * How long a topic may sit in "queued" before it is treated as abandoned rather than busy.
 *
 * `/topic/next` parks a topic in "queued" so a retrigger cannot hand out the same one, and
 * the generate route is supposed to move it on — to "published" if a deck shipped, back to
 * "idea" if none did. On 23 Sep 2026 that closing write was attempted and lost: the same
 * egress outage that starved the AI call also timed out the Turso connection, and the write
 * is deliberately swallowed so a partial success is never reported as a failure.
 *
 *   Failed to move topic topic_...cqs9mma to "idea": [TypeError: fetch failed]
 *     [cause]: ConnectTimeoutError ... turso.io:443, timeout: 10000ms
 *
 * The row stayed "queued", which no query reads, so the highest-priority news story in the
 * bank became invisible — permanently, and silently, with the bank one topic lighter every
 * time it happened. Retrying that write helps but cannot be relied on: it runs during the
 * outage, which is precisely when it fails.
 *
 * Six hours is well past any real run (the nightly finishes inside an hour) and well short
 * of the 72h freshness window, so a stranded story is recovered while it is still a story.
 */
export const QUEUED_STRANDED_MS = 6 * 60 * 60 * 1000;

/**
 * Return topics stranded in "queued" to "idea" so the pipeline can see them again.
 *
 * Deliberately narrow: only rows with no `carousel_id`, because a row that recorded a deck
 * did reach Buffer and must never be handed out a second time. Returns how many it freed.
 */
export async function reclaimStrandedTopics(
  userId: string,
  maxAgeMs: number = QUEUED_STRANDED_MS
): Promise<number> {
  await ensureSchema();

  const res = await db().execute({
    sql: `UPDATE topics
             SET status = 'idea', updated_at = ?
           WHERE user_id = ?
             AND status = 'queued'
             AND (carousel_id IS NULL OR carousel_id = '')
             AND updated_at < ?`,
    args: [Date.now(), userId, Date.now() - maxAgeMs],
  });

  const freed = Number(res.rowsAffected ?? 0);
  if (freed > 0) console.log(`[topics] reclaimed ${freed} topic(s) stranded in "queued"`);
  return freed;
}

export async function getNextTopicForBlog(userId: string): Promise<Topic | null> {
  await ensureSchema();

  // Free anything a previous run abandoned before deciding there is nothing to write about.
  await reclaimStrandedTopics(userId).catch((err) => {
    console.error("[topics] reclaim failed, continuing with the queue as-is:", err);
  });

  // A fresh story first, then the ordinary queue. See NEWS_FRESH_MS.
  const fresh = await getFreshNewsTopic(userId, "blog");
  if (fresh) return fresh;

  const res = await db().execute({
    sql: `SELECT * FROM topics 
          WHERE user_id = ? 
          AND (blog_status = 'not_used' OR blog_status IS NULL)
          ORDER BY priority DESC, created_at ASC 
          LIMIT 1`,
    args: [userId],
  });
  return res.rows[0] ? rowToTopic(res.rows[0]) : null;
}

export async function updateBlogStatus(
  id: string,
  userId: string,
  blogStatus: BlogStatus
): Promise<boolean> {
  await ensureSchema();
  const res = await db().execute({
    sql: `UPDATE topics SET blog_status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    args: [blogStatus, Date.now(), id, userId],
  });
  return (res.rowsAffected ?? 0) > 0;
}

export async function getTopic(id: string, userId: string): Promise<Topic | null> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT * FROM topics WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  return res.rows[0] ? rowToTopic(res.rows[0]) : null;
}

export async function deleteTopic(id: string, userId: string): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: `DELETE FROM topics WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
}

export async function getTopicsForWeek(userId: string, startDate: Date): Promise<Topic[]> {
  await ensureSchema();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const res = await db().execute({
    sql: `SELECT * FROM topics 
          WHERE user_id = ? 
          AND scheduled_date >= ? 
          AND scheduled_date < ?
          ORDER BY scheduled_date ASC`,
    args: [userId, startDate.toISOString(), endDate.toISOString()],
  });

  return res.rows.map(rowToTopic);
}
