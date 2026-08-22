import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const getSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  requireSession: vi.fn(),
}));

const { authMiddleware } = await import("@/middleware/auth");

/**
 * `getSession` returns null for a missing or invalid session — it only *throws*
 * when the session store itself could not be reached. Collapsing both into 500
 * is what made a provider packet-loss incident look like an auth bug: the
 * Next.js app rethrows the backend's message verbatim, so operators saw
 * "Internal Server Error in Auth Middleware" and went looking at auth code.
 */

function app() {
  const a = new Hono();
  a.use("*", authMiddleware());
  a.get("/", (c) => c.json({ ok: true, user: (c.get("session") as any)?.user?.id ?? null }));
  return a;
}

// The exact shape better-auth threw in production on 22 Aug 2026.
function betterAuthSessionFailure() {
  return Object.assign(new Error("Failed to get session"), {
    status: "INTERNAL_SERVER_ERROR",
    statusCode: 500,
    body: { message: "Failed to get session", code: "FAILED_TO_GET_SESSION" },
  });
}

function undiciTimeout() {
  const err = new TypeError("fetch failed");
  (err as any).cause = Object.assign(new Error("Connect Timeout Error"), {
    code: "UND_ERR_CONNECT_TIMEOUT",
  });
  return err;
}

describe("authMiddleware", () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes the request through and exposes the session", async () => {
    getSession.mockResolvedValue({ user: { id: "u-1" } });

    const res = await app().request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, user: "u-1" });
  });

  it("rejects a missing session with 401", async () => {
    getSession.mockResolvedValue(null);

    const res = await app().request("/");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/unauthorized/i);
  });

  it("answers 503, not 500, when the session store is unreachable", async () => {
    getSession.mockRejectedValue(betterAuthSessionFailure());

    const res = await app().request("/");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("2");
  });

  it("answers 503 for a raw undici connect timeout", async () => {
    getSession.mockRejectedValue(undiciTimeout());

    const res = await app().request("/");
    expect(res.status).toBe(503);
  });

  // A genuine defect must stay a 500 — 503 tells the caller "retry", and
  // retrying a broken query forever is worse than failing once.
  it("still answers 500 for a real defect", async () => {
    getSession.mockRejectedValue(new TypeError("x.map is not a function"));

    const res = await app().request("/");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal Server Error in Auth Middleware");
  });

  it("logs the underlying error so the incident is diagnosable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    getSession.mockRejectedValue(betterAuthSessionFailure());

    await app().request("/");
    expect(spy).toHaveBeenCalled();
  });
});
