import { Hono } from "hono";
import { getActiveProducts } from "../../lib/products/repo";

const app = new Hono<{ Variables: { session: any } }>();

/** Return active products for user UI dropdown */
app.get("/", async (c) => {
  const products = await getActiveProducts();
  return c.json({ products });
});

export default app;
