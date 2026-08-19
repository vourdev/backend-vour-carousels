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
  | "deep-dive";

export type TopicStatus = "idea" | "queued" | "generated" | "published" | "archived";

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

async function ensureSchema() {
  if (schemaEnsured) return;
  await db().execute(TOPICS_SCHEMA);
  schemaEnsured = true;
}

function rowToTopic(row: any): Topic {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    category: row.category as TopicCategory,
    description: row.description as string | undefined,
    keywords: JSON.parse(row.keywords as string),
    angle: row.angle as string | undefined,
    status: row.status as TopicStatus,
    priority: row.priority as number,
    scheduledDate: row.scheduled_date as string | undefined,
    carouselId: row.carousel_id as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
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
}): Promise<Topic> {
  await ensureSchema();
  const now = Date.now();
  const id = `topic_${now}_${Math.random().toString(36).substring(2, 9)}`;
  
  await db().execute({
    sql: `INSERT INTO topics (id, user_id, title, category, description, keywords, angle, status, priority, scheduled_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.userId,
      data.title,
      data.category,
      data.description || null,
      JSON.stringify(data.keywords || []),
      data.angle || null,
      "idea",
      data.priority || 0,
      data.scheduledDate || null,
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
