import type { Client } from "@libsql/client";
import { createRetryingClient, dbConfig } from "../libsql";
import type { SlidePlan } from "../ds/schema";

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
  slidePlan?: SlidePlan | null;
}

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function db(): Client {
  if (!client) {
    client = createRetryingClient(dbConfig());
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
        image_urls TEXT DEFAULT '[]',
        slide_plan TEXT
      )`);
      
      // Safe dynamic migration to add image_urls for existing databases
      try {
        await db().execute(`ALTER TABLE carousels ADD COLUMN image_urls TEXT DEFAULT '[]'`);
      } catch (e) {
        // Ignored if column already exists
      }

      // Safe dynamic migration to add slide_plan for existing databases
      try {
        await db().execute(`ALTER TABLE carousels ADD COLUMN slide_plan TEXT`);
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
    slidePlan: r.slide_plan ? JSON.parse(String(r.slide_plan)) : null,
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
  slidePlan?: SlidePlan | null;
}

export async function createCarousel(input: CreateCarouselInput): Promise<Carousel> {
  await ensureSchema();
  const now = Date.now();
  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO carousels
      (id, user_id, source, title, caption, hashtags, slide_count, status, model, thumbnail, image_urls, slide_plan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.slidePlan ? JSON.stringify(input.slidePlan) : null,
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
  slidePlan: "slide_plan",
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

export const ALL_MOCKUP_TYPES = [
  "card", "terminal", "comparison", "steps", "callout", "bigstat",
  "flow", "hub", "concept", "checklist", "promptcard", "foldertree",
  "commandpalette", "database", "gitbranch", "browser", "quote",
  "datatable", "commandlist", "timeline", "screenshot", "custom", "illustration",
  "apirequest", "eventqueue", "latencycomp", "config", "statemachine", "architecture",
  "decision", "mythfact", "pitfalls"
];

export async function getRecentMockupStats(userId: string, limit = 20): Promise<Record<string, number>> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT slide_plan FROM carousels WHERE user_id = ? AND slide_plan IS NOT NULL ORDER BY created_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  const counts: Record<string, number> = {};
  for (const row of res.rows) {
    try {
      const plan = JSON.parse(String(row.slide_plan)) as SlidePlan;
      if (plan && Array.isArray(plan.slides)) {
        for (const slide of plan.slides) {
          if (slide.role === "point" && slide.mockup?.type) {
            const mType = slide.mockup.type;
            counts[mType] = (counts[mType] || 0) + 1;
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }
  return counts;
}

/**
 * Rare on purpose, so never promoted as "underused".
 *
 * `screenshot` renders a "BUTUH SCREENSHOT ASLI" placeholder until a human uploads the
 * image, and the daily cron has no human in it. `custom` and `browser` are both capped at
 * roughly one per deck by the prompt. All three sit permanently at the bottom of any
 * frequency ranking, so a naive "least used" list recommends them on every single run.
 */
const NEVER_PROMOTE = new Set(["screenshot", "custom", "browser"]);

/**
 * Mockup types to nudge the model toward, or an empty list when we cannot tell.
 *
 * The empty case matters more than it looks. Every carousel written before the INSERT fix
 * in da88b89 stored a NULL slide_plan, so `stats` came back `{}` — every type tied at zero,
 * the sort was a no-op, and this returned the first ten entries of ALL_MOCKUP_TYPES in
 * array order. Those happen to be the most-used types in the deck (card, terminal,
 * comparison, steps, flow…), and the prompt presents this list as "UNDERUSED — prioritize
 * these". The diversity feature was therefore reinforcing the exact monoculture it exists
 * to break. With no evidence, say nothing.
 */
export async function getUnderusedMockupTypes(userId: string, limit = 25): Promise<string[]> {
  const stats = await getRecentMockupStats(userId, limit);
  if (Object.keys(stats).length === 0) return [];
  return ALL_MOCKUP_TYPES
    .filter((type) => !NEVER_PROMOTE.has(type))
    .map((type) => ({ type, count: stats[type] || 0 }))
    .sort((a, b) => a.count - b.count)
    .slice(0, 8)
    .map((x) => x.type);
}

/**
 * Mockup-type distribution, scoped to one user.
 *
 * `userId` was not a parameter at first, so the endpoint that serves this — a
 * session-authenticated route — reported every account's decks to whoever asked. Harmless
 * on a single-tenant install and wrong the moment there are two. Omitting it still reads
 * the whole table, which is what the maintenance query wants; the route always passes one.
 */
export async function getGlobalMockupStats(
  userId?: string
): Promise<{ type: string; count: number; percentage: number }[]> {
  await ensureSchema();
  const res = userId
    ? await db().execute({
        sql: `SELECT slide_plan FROM carousels WHERE user_id = ? AND slide_plan IS NOT NULL`,
        args: [userId],
      })
    : await db().execute(`SELECT slide_plan FROM carousels WHERE slide_plan IS NOT NULL`);
  const counts: Record<string, number> = {};
  let totalSlides = 0;
  for (const row of res.rows) {
    try {
      const plan = JSON.parse(String(row.slide_plan)) as SlidePlan;
      if (plan && Array.isArray(plan.slides)) {
        for (const slide of plan.slides) {
          if (slide.role === "point" && slide.mockup?.type) {
            const mType = slide.mockup.type;
            counts[mType] = (counts[mType] || 0) + 1;
            totalSlides++;
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  return ALL_MOCKUP_TYPES.map(type => {
    const count = counts[type] || 0;
    const percentage = totalSlides > 0 ? Math.round((count / totalSlides) * 10000) / 100 : 0;
    return { type, count, percentage };
  }).sort((a, b) => b.count - a.count);
}

/**
 * Returns mockup type usage with percentages from the last N carousels for a user.
 * Designed for prompt injection: the LLM sees not just "which types are underused"
 * but HOW underused they are (0% vs 2% vs 18%), making the nudge more persuasive.
 */
export async function getRecentMockupStatsWithPercentages(
  userId: string,
  limit = 25
): Promise<{ type: string; count: number; percentage: number }[]> {
  const counts = await getRecentMockupStats(userId, limit);
  const totalSlides = Object.values(counts).reduce((a, b) => a + b, 0);

  return ALL_MOCKUP_TYPES.map(type => {
    const count = counts[type] || 0;
    const percentage = totalSlides > 0 ? Math.round((count / totalSlides) * 10000) / 100 : 0;
    return { type, count, percentage };
  }).sort((a, b) => a.count - b.count); // least-used first
}

export const ALL_LAYOUT_VALUES = ["standard", "mockup-forward", "split-content", "note-emphasis"] as const;

/**
 * Returns layout distribution from recent N carousels — counts how often each
 * layout value appears across point slides. Used for diversity auditing.
 */
export async function getRecentLayoutStats(
  userId: string,
  limit = 25
): Promise<{ layout: string; count: number; percentage: number }[]> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT slide_plan FROM carousels WHERE user_id = ? AND slide_plan IS NOT NULL ORDER BY created_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  const counts: Record<string, number> = {};
  let totalSlides = 0;
  for (const row of res.rows) {
    try {
      const plan = JSON.parse(String(row.slide_plan)) as SlidePlan;
      if (plan && Array.isArray(plan.slides)) {
        for (const slide of plan.slides) {
          if (slide.role === "point") {
            const layout = (slide as any).layout || "standard";
            counts[layout] = (counts[layout] || 0) + 1;
            totalSlides++;
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  return ALL_LAYOUT_VALUES.map(layout => {
    const count = counts[layout] || 0;
    const percentage = totalSlides > 0 ? Math.round((count / totalSlides) * 10000) / 100 : 0;
    return { layout, count, percentage };
  }).sort((a, b) => b.count - a.count);
}
