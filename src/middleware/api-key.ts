import type { MiddlewareHandler } from "hono";

export const apiKeyMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const apiKey = c.req.header("X-API-Key");
    const secret = process.env.AUTOMATION_SECRET;
    
    if (!secret) {
      console.error("AUTOMATION_SECRET is not configured in environment");
      return c.json({ error: "Server Configuration Error" }, 500);
    }
    
    if (!apiKey || apiKey !== secret) {
      return c.json({ error: "Unauthorized: Invalid X-API-Key" }, 401);
    }
    
    await next();
  };
};
