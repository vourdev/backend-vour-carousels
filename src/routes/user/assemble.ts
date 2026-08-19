import { Hono } from "hono";
import { assembleCarousel } from "../../lib/ds/assemble";
import { warmUpIllustrations } from "../../lib/ds/illustrations.server";
import type { SlidePlan } from "../../lib/ds/schema";

const app = new Hono();

app.post("/", async (c) => {
  const { plan } = await c.req.json() as { plan: SlidePlan };
  if (!plan) {
    return c.json({ error: "Missing plan" }, 400);
  }
  await warmUpIllustrations();
  const html = assembleCarousel(plan);
  return c.json({ html });
});

export default app;
