import { Hono } from "hono";
import { getCarousel, listCarousels } from "../../lib/history/repo";

const app = new Hono<{ Variables: { session: any } }>();

/** Every handler here is user-scoped: the session owns the row, never the request path. */
function userId(c: any): string {
  return (c.get("session") as { user: { id: string } }).user.id;
}

app.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json({ carousels: await listCarousels(userId(c), limit) });
});

/**
 * One saved carousel, including the exported slide URLs.
 *
 * This is what a refreshed wizard reads. Before it existed the exported images were
 * `URL.createObjectURL()` blobs that died with the page, so Step 4 came back empty and
 * the wizard re-ran the whole Playwright capture to repopulate it — the most expensive
 * step in the pipeline, paid again for a result that had already been produced.
 *
 * Read-only on purpose. Writes go through the routes that own the transition:
 * /api/capture stores the URLs it just uploaded, /api/publish/carousel marks a row
 * scheduled. A general-purpose PATCH here would be a fourth way to set `status`.
 */
app.get("/:id", async (c) => {
  const carousel = await getCarousel(c.req.param("id"), userId(c));
  if (!carousel) return c.json({ error: "Carousel not found" }, 404);
  return c.json({ carousel });
});

export default app;
