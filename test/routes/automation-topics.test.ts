import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";

/**
 * First test to reach src/routes/ at all.
 *
 * The handlers were unreachable from a test before this: the module builds a Kysely
 * instance at import time, so the temp DATABASE_URL has to be in place BEFORE the import
 * — hence the dynamic imports below. Auth is not in the way, because the API-key
 * middleware is applied in server.ts where the route is mounted, not inside the route.
 */
const USER = "u-route-test";
let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
let createTopic: typeof import("@/lib/topics/bank").createTopic;
let getTopic: typeof import("@/lib/topics/bank").getTopic;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "route-automation-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;

  const db = createClient({ url: process.env.DATABASE_URL });
  await db.execute("CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY)");
  await db.execute({ sql: "INSERT INTO user (id) VALUES (?)", args: [USER] });

  app = (await import("@/routes/automation/generate")).default as never;
  const bank = await import("@/lib/topics/bank");
  createTopic = bank.createTopic;
  getTopic = bank.getTopic;
});

const patch = (id: string, status: string) =>
  app.request(`/research-topics/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

const seed = (status: "pending_review" | "approved" | "rejected" | "idea") =>
  createTopic({ userId: USER, title: `T ${status} ${Math.random()}`, category: "evergreen", status });

describe("PATCH /research-topics/:id/status", () => {
  it("approves a pending_review candidate", async () => {
    const t = await seed("pending_review");
    const res = await patch(t.id, "approved");
    expect(res.status).toBe(200);
    expect((await getTopic(t.id, USER))?.status).toBe("approved");
  });

  // Previously this answered 200 and changed nothing: updateTopic matches on
  // (id, user_id) and reports no rows affected, so a mistyped id looked like a success.
  it("404s on an id that does not exist", async () => {
    const res = await patch("topic_does_not_exist", "approved");
    expect(res.status).toBe(404);
  });

  // The transition table existed but was never consulted, so a rejected candidate could
  // jump straight into the posting queue.
  it("refuses a transition the table does not allow", async () => {
    const t = await seed("rejected");
    const res = await patch(t.id, "approved");
    expect(res.status).toBe(409);
    expect((await getTopic(t.id, USER))?.status).toBe("rejected");
  });

  // "not_posted" was accepted and written through an `as any`, producing a row that
  // matched no query anywhere.
  it("refuses not_posted, which is not a real status", async () => {
    const t = await seed("pending_review");
    const res = await patch(t.id, "not_posted");
    expect(res.status).toBe(409);
    expect((await getTopic(t.id, USER))?.status).toBe("pending_review");
  });
});

describe("GET /topic/next", () => {
  it("hands out an approved topic before an idea one", async () => {
    const idea = await seed("idea");
    const approved = await seed("approved");

    const res = await app.request("/topic/next");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(approved.id);

    // and it is claimed, so a retrigger cannot hand out the same row twice
    expect((await getTopic(approved.id, USER))?.status).toBe("queued");
    expect((await getTopic(idea.id, USER))?.status).toBe("idea");
  });
});
