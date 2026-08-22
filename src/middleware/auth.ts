import type { MiddlewareHandler } from "hono";
import { getSession } from "../lib/session";
import { isTransientNetworkError } from "../lib/retry";

/**
 * `getSession` returns null for a missing or invalid session, so a thrown error
 * always means the session store itself failed — not that the caller is
 * unauthenticated. better-auth reports that as an APIError carrying
 * `FAILED_TO_GET_SESSION`, with the real cause (a dropped connection to Turso)
 * already swallowed.
 */
function isSessionStoreUnreachable(err: any): boolean {
  if (isTransientNetworkError(err)) return true;
  return err?.body?.code === "FAILED_TO_GET_SESSION";
}

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

      // The libsql client already retried underneath; reaching here means the
      // link stayed down. 503 tells the caller this is worth retrying, and
      // stops a provider network incident from being read as an auth bug.
      if (isSessionStoreUnreachable(err)) {
        c.header("Retry-After", "2");
        return c.json({ error: "Auth store temporarily unreachable, please retry" }, 503);
      }

      return c.json({ error: "Internal Server Error in Auth Middleware" }, 500);
    }
  };
};
