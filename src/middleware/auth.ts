import type { MiddlewareHandler } from "hono";
import { getSession } from "../lib/session";

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    try {
      const headers = new Headers();
      
      const authHeader = c.req.header("Authorization");
      if (authHeader) {
        headers.set("Authorization", authHeader);
      }
      
      const cookieHeader = c.req.header("Cookie");
      if (cookieHeader) {
        headers.set("Cookie", cookieHeader);
      }
      
      const session = await getSession(headers);
      if (!session) {
        return c.json({ error: "Unauthorized: Invalid or missing session" }, 401);
      }
      
      c.set("session", session);
      await next();
    } catch (err: any) {
      console.error("Auth middleware error:", err);
      return c.json({ error: "Internal Server Error in Auth Middleware" }, 500);
    }
  };
};
