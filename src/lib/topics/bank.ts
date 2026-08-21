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

export interface Topic {
  id: string;
  title: string;
  category: TopicCategory;
  description?: string;
  keywords: string[];
  angle?: string;
  status: TopicStatus;
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
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_date TEXT,
  carousel_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
)`;

let schemaEnsured = false;

/** Columns added by the research agent. ALTER TABLE ADD COLUMN is a no-op if the column already exists in SQLite. */
const MIGRATION_COLUMNS = [
  "source TEXT",
  "related_product_id TEXT",
  "target_audience_fit TEXT",
  "suggested_angle TEXT",
];

async function ensureSchema() {
  if (schemaEnsured) return;
  await db().execute(TOPICS_SCHEMA);

  // Add research-agent columns to existing tables (idempotent — errors on
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
  };
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
  source?: string;
  relatedProductId?: string;
  related_product_id?: string;
  targetAudienceFit?: string;
  target_audience_fit?: string;
  suggestedAngle?: string;
  suggested_angle?: string;
}): Promise<Topic> {
  await ensureSchema();
  const now = Date.now();
  const id = `topic_${now}_${Math.random().toString(36).substring(2, 9)}`;
  const relProdId = data.relatedProductId ?? data.related_product_id ?? null;
  const audFit = data.targetAudienceFit ?? data.target_audience_fit ?? null;
  const sugAngle = data.suggestedAngle ?? data.suggested_angle ?? null;
  
  await db().execute({
    sql: `INSERT INTO topics (id, user_id, title, category, description, keywords, angle, status, priority, scheduled_date, source, related_product_id, target_audience_fit, suggested_angle, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.userId,
      data.title,
      data.category,
      data.description || null,
      JSON.stringify(data.keywords || []),
      data.angle || null,
      data.status || "idea",
      data.priority || 0,
      data.scheduledDate || null,
      data.source || null,
      relProdId,
      audFit,
      sugAngle,
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
