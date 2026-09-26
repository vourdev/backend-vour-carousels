import { Hono } from "hono";
import { serviceAuthMiddleware, rateLimitMiddleware } from "../../middleware/service-auth";
import {
  getNextTopicForBlog,
  getTopic,
  updateBlogStatus,
  type BlogStatus,
} from "../../lib/topics/bank";

const app = new Hono<{ Variables: { userId: string } }>();

// Apply service-to-service auth and rate limiting to all endpoints in this router
app.use("*", rateLimitMiddleware(), serviceAuthMiddleware());

const ALLOWED_BLOG_STATUSES = new Set<BlogStatus>([
  "not_used",
  "generating",
  "published",
  "failed",
]);

/**
 * GET /next-for-blog
 * Returns 1 unstarted topic for blog generation (blog_status = "not_used").
 *
 * `sourceUrls` and `visualHint` are additive, and only news-discovery rows carry them. They
 * have to cross this boundary: a topic discovered from the press is only worth publishing if
 * the article is written against what those sources actually say, and the blog generator runs
 * in another service (backend-vour-studio) that cannot read this database. A consumer that
 * ignores the two new keys behaves exactly as before.
 */
app.get("/next-for-blog", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized: Missing user context" }, 401);
  }

  const topic = await getNextTopicForBlog(userId);
  if (!topic) {
    return c.json({ error: "No unused blog topics available in the bank" }, 404);
  }

  return c.json({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    category: topic.category,
    tags: topic.keywords,
    angle: topic.angle,
    sourceUrls: topic.sourceUrls,
    visualHint: topic.visualHint,
    sourceImageUrl: topic.sourceImageUrl,
  });
});

/**
 * GET /:id
 * One topic by id, same shape as /next-for-blog.
 *
 * This exists because the nightly workflow hands the blog generator a topic object it builds
 * by hand -- `{ id, title, category, description, angle }` -- so a field added to
 * /next-for-blog never reaches the other service on that path. Rather than edit the workflow
 * (its last hand-edit shipped a topic twice), the generator re-reads the row it was given the
 * id of and picks up whatever this endpoint knows, including the sources to write against.
 */
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized: Missing user context" }, 401);
  }

  const topic = await getTopic(c.req.param("id"), userId);
  if (!topic) {
    return c.json({ error: "Topic not found" }, 404);
  }

  return c.json({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    category: topic.category,
    tags: topic.keywords,
    angle: topic.angle,
    sourceUrls: topic.sourceUrls,
    visualHint: topic.visualHint,
    sourceImageUrl: topic.sourceImageUrl,
  });
});

/**
 * PATCH /:id/blog-status
 * Updates only the blog_status column for a topic.
 * Preserves the carousel status without modification.
 */
app.patch("/:id/blog-status", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "Unauthorized: Missing user context" }, 401);
  }

  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    status?: string;
    blog_status?: string;
  };

  const status = (body.status ?? body.blog_status) as BlogStatus;
  if (!status || !ALLOWED_BLOG_STATUSES.has(status)) {
    return c.json(
      {
        error: `Invalid status "${status}". Allowed values: not_used | generating | published | failed`,
      },
      400
    );
  }

  const updated = await updateBlogStatus(id, userId, status);
  if (!updated) {
    return c.json({ error: "Topic not found" }, 404);
  }

  return c.json({
    success: true,
    id,
    blog_status: status,
  });
});

export default app;
