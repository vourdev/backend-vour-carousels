import { createClient, type Client } from "@libsql/client";

export type CarouselStatus = "draft" | "exported" | "scheduled" | "posted" | "failed";
export type CarouselSource = "ai" | "upload";

export interface Carousel {
  id: string;
  userId: string;
  source: CarouselSource;
  title: string;
  caption: string;
  hashtags: string[];
  slideCount: number;
  status: CarouselStatus;
  model: string | null;
  thumbnail: string | null;
  bufferIgId: string | null;
  bufferTtId: string | null;
  dueAt: string | null;
  createdAt: number;
  updatedAt: number;
  imageUrls: string[];
}

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function db(): Client {
  if (!client) {
    client = createClient({
      url: process.env.DATABASE_URL ?? "file:local-auth.db",
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return client;
}

/** Create the carousels table once per process (shares the Better Auth db). */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db().execute(`CREATE TABLE IF NOT EXISTS carousels (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        caption TEXT NOT NULL DEFAULT '',
        hashtags TEXT NOT NULL DEFAULT '[]',
        slide_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        model TEXT,
        thumbnail TEXT,
        buffer_ig_id TEXT,
        buffer_tt_id TEXT,
        due_at TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        image_urls TEXT DEFAULT '[]'
      )`);
      
      // Safe dynamic migration to add image_urls for existing databases
      try {
        await db().execute(`ALTER TABLE carousels ADD COLUMN image_urls TEXT DEFAULT '[]'`);
      } catch (e) {
        // Ignored if column already exists
      }

      await db().execute(
        `CREATE INDEX IF NOT EXISTS idx_carousels_user ON carousels(user_id, created_at DESC)`
      );
    })();
  }
  return schemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToCarousel(r: any): Carousel {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    source: r.source as CarouselSource,
    title: String(r.title),
    caption: String(r.caption ?? ""),
    hashtags: JSON.parse(String(r.hashtags ?? "[]")),
    slideCount: Number(r.slide_count ?? 0),
    status: r.status as CarouselStatus,
    model: r.model ?? null,
    thumbnail: r.thumbnail ?? null,
    bufferIgId: r.buffer_ig_id ?? null,
    bufferTtId: r.buffer_tt_id ?? null,
    dueAt: r.due_at ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    imageUrls: JSON.parse(String(r.image_urls ?? "[]")),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CreateCarouselInput {
  userId: string;
  source: CarouselSource;
  title: string;
  caption?: string;
  hashtags?: string[];
  slideCount?: number;
  model?: string | null;
  status?: CarouselStatus;
  thumbnail?: string | null;
  imageUrls?: string[];
}

export async function createCarousel(input: CreateCarouselInput): Promise<Carousel> {
  await ensureSchema();
  const now = Date.now();
  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO carousels
      (id, user_id, source, title, caption, hashtags, slide_count, status, model, thumbnail, image_urls, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.userId,
      input.source,
      input.title,
      input.caption ?? "",
      JSON.stringify(input.hashtags ?? []),
      input.slideCount ?? 0,
      input.status ?? "draft",
      input.model ?? null,
      input.thumbnail ?? null,
      JSON.stringify(input.imageUrls ?? []),
      now,
      now,
    ],
  });
  const created = await getCarousel(id, input.userId);
  if (!created) throw new Error("failed to create carousel");
  return created;
}

const PATCH_COLUMNS: Record<string, string> = {
  status: "status",
  thumbnail: "thumbnail",
  bufferIgId: "buffer_ig_id",
  bufferTtId: "buffer_tt_id",
  dueAt: "due_at",
  title: "title",
  caption: "caption",
  imageUrls: "image_urls",
};

export async function updateCarousel(
  id: string,
  patch: Partial<
    Pick<Carousel, "status" | "thumbnail" | "bufferIgId" | "bufferTtId" | "dueAt" | "title" | "caption" | "imageUrls">
  >
): Promise<void> {
  await ensureSchema();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(PATCH_COLUMNS)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      const val = (patch as any)[key];
      args.push(Array.isArray(val) ? JSON.stringify(val) : val);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  args.push(Date.now());
  args.push(id);
  await db().execute({ sql: `UPDATE carousels SET ${sets.join(", ")} WHERE id = ?`, args });
}

export async function listCarousels(userId: string, limit = 50): Promise<Carousel[]> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT * FROM carousels WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  return res.rows.map(rowToCarousel);
}

export async function getCarousel(id: string, userId: string): Promise<Carousel | null> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT * FROM carousels WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  return res.rows[0] ? rowToCarousel(res.rows[0]) : null;
}

export async function deleteCarousel(id: string, userId: string): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: `DELETE FROM carousels WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
}
