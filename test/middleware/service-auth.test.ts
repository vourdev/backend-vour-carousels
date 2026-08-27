import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

describe("serviceAuthMiddleware & rateLimitMiddleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when VOURDEV_SERVICE_KEY is missing from environment with 500", async () => {
    delete process.env.VOURDEV_SERVICE_KEY;
    const { serviceAuthMiddleware } = await import("@/middleware/service-auth");

    const app = new Hono();
    app.use("*", serviceAuthMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer some-key" },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Missing VOURDEV_SERVICE_KEY/i);
  });

  it("rejects missing Authorization header with 401", async () => {
    process.env.VOURDEV_SERVICE_KEY = "test-service-secret-123";
    const { serviceAuthMiddleware } = await import("@/middleware/service-auth");

    const app = new Hono();
    app.use("*", serviceAuthMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Missing or invalid Authorization header/i);
  });

  it("rejects non-Bearer Authorization header with 401", async () => {
    process.env.VOURDEV_SERVICE_KEY = "test-service-secret-123";
    const { serviceAuthMiddleware } = await import("@/middleware/service-auth");

    const app = new Hono();
    app.use("*", serviceAuthMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Authorization: "Basic test-service-secret-123" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Bearer token required/i);
  });

  it("rejects incorrect service key with 401", async () => {
    process.env.VOURDEV_SERVICE_KEY = "test-service-secret-123";
    const { serviceAuthMiddleware } = await import("@/middleware/service-auth");

    const app = new Hono();
    app.use("*", serviceAuthMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { Authorization: "Bearer wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Invalid service key/i);
  });

  it("enforces rate limits and responds with 429 and Retry-After", async () => {
    const { rateLimitMiddleware } = await import("@/middleware/service-auth");

    const app = new Hono();
    // 3 requests per 10 seconds
    app.use("*", rateLimitMiddleware({ limit: 3, windowMs: 10_000 }));
    app.get("/test", (c) => c.json({ ok: true }));

    // 1st request
    const r1 = await app.request("/test", { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(r1.status).toBe(200);
    expect(r1.headers.get("X-RateLimit-Remaining")).toBe("2");

    // 2nd request
    const r2 = await app.request("/test", { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(r2.status).toBe(200);
    expect(r2.headers.get("X-RateLimit-Remaining")).toBe("1");

    // 3rd request
    const r3 = await app.request("/test", { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(r3.status).toBe(200);
    expect(r3.headers.get("X-RateLimit-Remaining")).toBe("0");

    // 4th request -> blocked
    const r4 = await app.request("/test", { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(r4.status).toBe(429);
    expect(r4.headers.get("Retry-After")).toBeDefined();
    const body = (await r4.json()) as { error: string };
    expect(body.error).toMatch(/Too many requests/i);
  });
});
