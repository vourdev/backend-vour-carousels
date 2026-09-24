import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { Hono } from "hono";

const USER = "u-blog-test-user";
const SERVICE_KEY = "vourdev-secret-key-xyz";

let serviceTopicsRoute: any;
let createTopic: typeof import("@/lib/topics/bank").createTopic;
let getTopic: typeof import("@/lib/topics/bank").getTopic;
let updateTopic: typeof import("@/lib/topics/bank").updateTopic;

function buildApp() {
  const app = new Hono();
  app.route("/api/topics", serviceTopicsRoute);
  return app;
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "service-topics-test-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  process.env.VOURDEV_SERVICE_KEY = SERVICE_KEY;

  const db = createClient({ url: process.env.DATABASE_URL });
  await db.execute("CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY)");
  await db.execute({ sql: "INSERT INTO user (id) VALUES (?)", args: [USER] });

  serviceTopicsRoute = (await import("@/routes/service/topics")).default;
  const bank = await import("@/lib/topics/bank");
  createTopic = bank.createTopic;
  getTopic = bank.getTopic;
  updateTopic = bank.updateTopic;
});

describe("Service-to-Service Blog Topics API", () => {
  const authHeader = { Authorization: `Bearer ${SERVICE_KEY}` };

  it("rejects requests without valid VOURDEV_SERVICE_KEY with 401", async () => {
    const app = buildApp();
    const res = await app.request("/api/topics/next-for-blog");
    expect(res.status).toBe(401);

    const res2 = await app.request("/api/topics/next-for-blog", {
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(res2.status).toBe(401);
  });

  describe("GET /api/topics/next-for-blog", () => {
    it("returns 1 topic with blog_status = 'not_used' with only relevant fields", async () => {
      const app = buildApp();
      const created = await createTopic({
        userId: USER,
        title: "Docker Multi-Stage Builds untuk Node.js",
        category: "developer-tools",
        description: "Panduan optimasi docker image backend",
        keywords: ["docker", "devops", "nodejs"],
        angle: "practical-guide",
        priority: 5,
        status: "idea",
        blogStatus: "not_used",
      });

      const res = await app.request("/api/topics/next-for-blog", {
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;

      expect(data.id).toBe(created.id);
      expect(data.title).toBe("Docker Multi-Stage Builds untuk Node.js");
      expect(data.description).toBe("Panduan optimasi docker image backend");
      expect(data.category).toBe("developer-tools");
      expect(data.tags).toEqual(["docker", "devops", "nodejs"]);

      // Verify internal columns are NOT exposed
      expect(data.userId).toBeUndefined();
      expect(data.user_id).toBeUndefined();
      expect(data.status).toBeUndefined();
      expect(data.carouselId).toBeUndefined();
      expect(data.priority).toBeUndefined();
    });

    it("prioritizes higher priority and older created topics", async () => {
      const app = buildApp();
      const lowPriority = await createTopic({
        userId: USER,
        title: "Low Priority Topic",
        category: "productivity",
        keywords: ["productivity"],
        priority: 1,
        status: "idea",
        blogStatus: "not_used",
      });

      const highPriority = await createTopic({
        userId: USER,
        title: "High Priority Topic",
        category: "nextjs",
        keywords: ["nextjs"],
        priority: 10,
        status: "idea",
        blogStatus: "not_used",
      });

      const res = await app.request("/api/topics/next-for-blog", {
        headers: authHeader,
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.id).toBe(highPriority.id);
    });

    it("returns 404 when no topics with blog_status 'not_used' exist", async () => {
      const app = buildApp();
      // Update all existing topics to published
      const all = await (await import("@/lib/topics/bank")).getTopics(USER);
      for (const t of all) {
        await updateTopic(t.id, USER, { blogStatus: "published" });
      }

      const res = await app.request("/api/topics/next-for-blog", {
        headers: authHeader,
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/No unused blog topics/i);
    });
  });

  describe("PATCH /api/topics/:id/blog-status & Status Isolation", () => {
    it("updates blog_status and preserves carousel status untouched", async () => {
      const app = buildApp();
      const topic = await createTopic({
        userId: USER,
        title: "Isolasi Status Test Topic",
        category: "evergreen",
        keywords: ["testing"],
        status: "approved",
        blogStatus: "not_used",
      });

      // 1. Update to generating
      const resGen = await app.request(`/api/topics/${topic.id}/blog-status`, {
        method: "PATCH",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "generating" }),
      });
      expect(resGen.status).toBe(200);
      expect((await resGen.json()).blog_status).toBe("generating");

      // Verify DB state: blog_status is generating, carousel status is STILL approved
      let dbTopic = await getTopic(topic.id, USER);
      expect(dbTopic?.blogStatus).toBe("generating");
      expect(dbTopic?.status).toBe("approved");

      // 2. Update to published
      const resPub = await app.request(`/api/topics/${topic.id}/blog-status`, {
        method: "PATCH",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "published" }),
      });
      expect(resPub.status).toBe(200);
      expect((await resPub.json()).blog_status).toBe("published");

      // Verify DB state
      dbTopic = await getTopic(topic.id, USER);
      expect(dbTopic?.blogStatus).toBe("published");
      expect(dbTopic?.status).toBe("approved");

      // 3. Update carousel status via standard carousel workflow and verify blogStatus is unchanged
      await updateTopic(topic.id, USER, { status: "published" });
      dbTopic = await getTopic(topic.id, USER);
      expect(dbTopic?.status).toBe("published");
      expect(dbTopic?.blogStatus).toBe("published");
    });

    it("supports failed status update", async () => {
      const app = buildApp();
      const topic = await createTopic({
        userId: USER,
        title: "Failed Topic Test",
        category: "tutorial",
        keywords: ["tutorial"],
        status: "idea",
        blogStatus: "generating",
      });

      const res = await app.request(`/api/topics/${topic.id}/blog-status`, {
        method: "PATCH",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "failed" }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).blog_status).toBe("failed");

      const dbTopic = await getTopic(topic.id, USER);
      expect(dbTopic?.blogStatus).toBe("failed");
      expect(dbTopic?.status).toBe("idea");
    });

    it("rejects invalid status values with 400", async () => {
      const app = buildApp();
      const topic = await createTopic({
        userId: USER,
        title: "Invalid Status Test",
        category: "tutorial",
        keywords: ["tutorial"],
        status: "idea",
        blogStatus: "not_used",
      });

      const res = await app.request(`/api/topics/${topic.id}/blog-status`, {
        method: "PATCH",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "invalid_status" }),
      });
      expect(res.status).toBe(400);

      const dbTopic = await getTopic(topic.id, USER);
      expect(dbTopic?.blogStatus).toBe("not_used");
    });

    it("returns 404 for a non-existent topic id", async () => {
      const app = buildApp();
      const res = await app.request("/api/topics/topic_non_existent/blog-status", {
        method: "PATCH",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "published" }),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/Topic not found/i);
    });
  });
});

describe("GET /:id — the row a workflow only sent an id for", () => {
  const authHeader = { Authorization: `Bearer ${SERVICE_KEY}` };

  it("returns the sources a news-discovery topic was written from", async () => {
    // The nightly workflow builds its topic object by hand and cannot forward a field it does
    // not know about, so the blog generator re-reads the row by id to get the sources. Without
    // this the article about a real release is written from the model's memory of an older one.
    const topic = await createTopic({
      userId: USER,
      title: "Google Rilis Agent Development Kit 1.0 buat Kotlin",
      category: "trending",
      description: "ADK 1.0 kini setara versi Python dan Java.",
      keywords: ["Kotlin", "ADK"],
      angle: "fokus: Rilis & Daftar Perubahan",
      source: "news-discovery",
      sourceUrls: [
        "https://www.infoq.com/news/2026/09/google-adk-1-0-released/",
        "https://developers.googleblog.com/build-zero-trust-ai-agents/",
      ],
      visualHint: "changelog",
    });

    const app = buildApp();
    const res = await app.request(`/api/topics/${topic.id}`, { headers: authHeader });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.id).toBe(topic.id);
    expect(body.sourceUrls).toHaveLength(2);
    expect(body.visualHint).toBe("changelog");
    expect(body.angle).toBe("fokus: Rilis & Daftar Perubahan");
  });

  it("does not shadow /next-for-blog", async () => {
    // Registration order decides this: a bare `/:id` declared first would swallow the
    // literal route and answer 404 for it.
    const app = buildApp();
    const res = await app.request("/api/topics/next-for-blog", { headers: authHeader });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as any;
      expect(body.id).toBeDefined();
      expect(body.error).toBeUndefined();
    } else {
      // 404 only ever means "the bank has nothing unused", never "no such route".
      expect((await res.json()).error).toMatch(/No unused blog topics/i);
    }
  });

  it("404s for an id that is not in the bank", async () => {
    const app = buildApp();
    const res = await app.request("/api/topics/topic_does_not_exist", { headers: authHeader });
    expect(res.status).toBe(404);
  });

  it("still requires the service key", async () => {
    const app = buildApp();
    const res = await app.request("/api/topics/whatever");
    expect(res.status).toBe(401);
  });
});

describe("news jumps the queue while it is still news", () => {
  const authHeader = { Authorization: `Bearer ${SERVICE_KEY}` };

  async function ageTopic(id: string, ms: number) {
    // createTopic stamps `now`; there is no API for backdating, and the rule under test is
    // entirely about age, so the row is aged directly.
    const { createClient } = await import("@libsql/client");
    const db = createClient({ url: process.env.DATABASE_URL! });
    await db.execute({ sql: "UPDATE topics SET created_at = ? WHERE id = ?", args: [Date.now() - ms, id] });
  }

  it("prefers a story from today over a higher-priority evergreen topic", async () => {
    // Priority alone would hand out the evergreen one and the story would go stale waiting.
    await createTopic({
      userId: USER,
      title: "Evergreen: RAG vs Fine-Tuning",
      category: "evergreen",
      priority: 10,
      keywords: [],
    });
    const news = await createTopic({
      userId: USER,
      title: "Celah 0-Day di Meta Muse",
      category: "trending",
      priority: 8,
      keywords: [],
      source: "news-discovery",
      sourceUrls: ["https://arstechnica.com/a", "https://www.wired.com/b"],
      visualHint: "illustration",
    });

    const app = buildApp();
    const res = await app.request("/api/topics/next-for-blog", { headers: authHeader });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe(news.id);
    expect(body.sourceUrls).toHaveLength(2);
  });

  it("stops treating a story as news once it is four days old", async () => {
    const stale = await createTopic({
      userId: USER,
      title: "Berita basi yang sudah lewat",
      category: "trending",
      priority: 8,
      keywords: [],
      source: "news-discovery",
      sourceUrls: ["https://arstechnica.com/old"],
    });
    await ageTopic(stale.id, 96 * 60 * 60 * 1000);

    const evergreen = await createTopic({
      userId: USER,
      title: "Evergreen yang menang lagi",
      category: "evergreen",
      priority: 10,
      keywords: [],
    });

    const app = buildApp();
    const body = (await (await app.request("/api/topics/next-for-blog", { headers: authHeader })).json()) as any;
    // Whatever the ordinary queue picks, it must not be the stale story jumping ahead.
    expect(body.id).not.toBe(stale.id);
    expect([evergreen.id, body.id]).toContain(body.id);
  });

  it("ignores a topic that carries no sources, whatever its category", async () => {
    // "trending" is also what the batch generator emits from the model's own memory. Only a
    // corroborated story -- one with sources -- is allowed to jump the queue.
    const unsourced = await createTopic({
      userId: USER,
      title: "Trending tapi tanpa sumber sama sekali",
      category: "trending",
      priority: 1,
      keywords: [],
      source: "batch",
    });

    const app = buildApp();
    const body = (await (await app.request("/api/topics/next-for-blog", { headers: authHeader })).json()) as any;
    expect(body.id).not.toBe(unsourced.id);
  });
});

/**
 * The 23 Sep 2026 nightly lost its topic twice over. The outage that starved the AI call
 * also timed out the closing write that should have returned the row from "queued" to
 * "idea", and that error is swallowed on purpose so a scheduled post is never reported as a
 * failure. The row then sat in a status no query reads, so the highest-priority story in the
 * bank was invisible — permanently, and with no symptom other than "the bank looks empty".
 */
describe("a topic stranded in queued comes back", () => {
  const authHeader = { Authorization: `Bearer ${SERVICE_KEY}` };

  async function strand(id: string, ageMs: number) {
    const { createClient } = await import("@libsql/client");
    const db = createClient({ url: process.env.DATABASE_URL! });
    await db.execute({
      sql: "UPDATE topics SET status = 'queued', updated_at = ? WHERE id = ?",
      args: [Date.now() - ageMs, id],
    });
  }

  it("reclaims one abandoned hours ago and hands it out again", async () => {
    const t = await createTopic({
      userId: USER,
      title: "Model Baru OpenAI & Anthropic Makin Murah",
      category: "trending",
      priority: 9,
      keywords: [],
      source: "news-discovery",
      sourceUrls: ["https://arstechnica.com/x", "https://www.engadget.com/y"],
    });
    await strand(t.id, 8 * 60 * 60 * 1000);

    const app = buildApp();
    const body = (await (
      await app.request("/api/topics/next-for-blog", { headers: authHeader })
    ).json()) as any;

    expect(body.id).toBe(t.id);
    expect((await getTopic(t.id, USER))!.status).toBe("idea");
  });

  it("leaves a run that is still in flight alone", async () => {
    const t = await createTopic({
      userId: USER,
      title: "Sedang digarap barusan",
      category: "trending",
      priority: 9,
      keywords: [],
      source: "news-discovery",
      sourceUrls: ["https://arstechnica.com/p", "https://www.theverge.com/q"],
    });
    await strand(t.id, 5 * 60 * 1000);

    expect((await getTopic(t.id, USER))!.status).toBe("queued");
    const { reclaimStrandedTopics } = await import("@/lib/topics/bank");
    expect(await reclaimStrandedTopics(USER)).toBe(0);
    expect((await getTopic(t.id, USER))!.status).toBe("queued");
  });

  it("never reclaims a topic that already recorded a deck", async () => {
    // "queued" plus a carousel_id means something reached Buffer. Handing it out again
    // would post the same topic a second time, which is worse than losing it.
    const t = await createTopic({
      userId: USER,
      title: "Sudah tayang sebagian",
      category: "trending",
      priority: 9,
      keywords: [],
    });
    await updateTopic(t.id, USER, { carouselId: "buffer-deck-1" });
    await strand(t.id, 24 * 60 * 60 * 1000);

    const { reclaimStrandedTopics } = await import("@/lib/topics/bank");
    expect(await reclaimStrandedTopics(USER)).toBe(0);
    expect((await getTopic(t.id, USER))!.status).toBe("queued");
  });
});
