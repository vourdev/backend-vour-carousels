import { describe, it, expect, beforeAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const DB_FILE = join(tmpdir(), `web-evidence-log-${process.pid}.db`);

beforeAll(() => {
  rmSync(DB_FILE, { force: true });
  process.env.DATABASE_URL = `file:${DB_FILE}`;
  delete process.env.DATABASE_AUTH_TOKEN;
});

const { logEvidenceAttempt, evidenceFailureStats } = await import("../../src/lib/evidence/log");

/**
 * The audit log swallows its own errors on purpose — a logging failure must never stop a
 * deck shipping. That makes a broken INSERT invisible in production, so it is checked
 * here against a real database file rather than a mock.
 */
describe("web evidence audit log", () => {
  it("creates its table and records what happened, per host", async () => {
    await logEvidenceAttempt({ path: "automation", entity: "OpenCode homepage", host: "opencode.ai", url: "https://opencode.ai", outcome: "captured", durationMs: 4200, metrics: { bytes: 1 } });
    await logEvidenceAttempt({ path: "automation", entity: "Flaky Co", host: "flaky.example", outcome: "rejected", reason: "mostly-blank" });
    await logEvidenceAttempt({ path: "user", entity: "Flaky Co", host: "flaky.example", outcome: "error", reason: "HTTP 503" });

    const stats = await evidenceFailureStats();
    const flaky = stats.find((s) => s.host === "flaky.example");
    const good = stats.find((s) => s.host === "opencode.ai");

    // The question the table exists to answer: which sites keep failing.
    expect(flaky).toMatchObject({ attempts: 2, captured: 0, failed: 2 });
    expect(good).toMatchObject({ attempts: 1, captured: 1, failed: 0 });
    expect(stats[0].host).toBe("flaky.example");
  });

  it("records a skip that never reached a host", async () => {
    await logEvidenceAttempt({ path: "automation", entity: "Zorblax", outcome: "skipped", reason: "uncorroborated" });
    const stats = await evidenceFailureStats();
    // Hostless rows stay out of the per-host ranking rather than grouping under null.
    expect(stats.every((s) => s.host !== "null")).toBe(true);
  });
});
