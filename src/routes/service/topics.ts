import { Hono } from "hono";
import { serviceAuthMiddleware, rateLimitMiddleware } from "../../middleware/service-auth";
import {
  getNextTopicForBlog,
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
 * Returns ONLY relevant fields: id, title, description, category, tags.
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
