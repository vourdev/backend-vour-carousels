import type { MiddlewareHandler } from "hono";
import { Kysely } from "kysely";
import { dialect } from "../lib/db";

let cachedDb: Kysely<any> | null = null;
function getDb() {
  if (!cachedDb) {
    cachedDb = new Kysely<any>({ dialect });
  }
  return cachedDb;
}

export async function resolveOperatorUserId(): Promise<string | null> {
  try {
    const user = await getDb().selectFrom("user").select("id").limit(1).executeTakeFirst();
    return (user?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Service-to-service authentication middleware for external consumers (e.g. vour.dev).
 * Expects `Authorization: Bearer <VOURDEV_SERVICE_KEY>`.
 */
export const serviceAuthMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const secret = process.env.VOURDEV_SERVICE_KEY;
    if (!secret) {
      console.error("VOURDEV_SERVICE_KEY is not configured in environment");
      return c.json({ error: "Server Configuration Error: Missing VOURDEV_SERVICE_KEY" }, 500);
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized: Missing or invalid Authorization header (Bearer token required)" }, 401);
    }

    const token = authHeader.substring("Bearer ".length).trim();
    if (token !== secret) {
      return c.json({ error: "Unauthorized: Invalid service key" }, 401);
    }

    const userId = await resolveOperatorUserId();
    if (!userId) {
      return c.json({ error: "No user found in database. Seed the database first." }, 500);
    }

    c.set("userId" as any, userId);
    await next();
  };
};

interface RateLimitRecord {
  timestamps: number[];
}

/**
 * In-memory sliding window rate limiter.
 * Default: 60 requests per 60 seconds per client IP or key.
 */
export const rateLimitMiddleware = (options: {
  limit?: number;
  windowMs?: number;
} = {}): MiddlewareHandler => {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const requests = new Map<string, RateLimitRecord>();

  return async (c, next) => {
    const now = Date.now();
    const clientKey = c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || "default-service-client";

    let record = requests.get(clientKey);
    if (!record) {
      record = { timestamps: [] };
      requests.set(clientKey, record);
    }

    // Clean up timestamps outside window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    if (record.timestamps.length >= limit) {
      const oldest = record.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      c.header("Retry-After", String(Math.max(1, retryAfterSeconds)));
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil((oldest + windowMs) / 1000)));
      return c.json({ error: "Too many requests, please try again later" }, 429);
    }

    record.timestamps.push(now);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(limit - record.timestamps.length));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));

    await next();
  };
};
