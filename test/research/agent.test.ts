import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";

const result = (text: string) =>
  ({
    finishReason: { unified: "stop" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
    content: [{ type: "text", text }],
    warnings: [],
  }) as unknown as LanguageModelV4GenerateResult;

const USER = "u-research-test";
let extractAndSaveTopicsFromNotes: typeof import("@/lib/research/agent").extractAndSaveTopicsFromNotes;
let createTopic: typeof import("@/lib/topics/bank").createTopic;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "research-agent-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;

  // topics carries a FOREIGN KEY to user(id), so the table has to exist before
  // ensureSchema runs — otherwise every insert fails with "no such table: main.user".
  const db = createClient({ url: process.env.DATABASE_URL });
  await db.execute("CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY)");
  for (const id of [USER, `${USER}-dup`, `${USER}-intra`, `${USER}-prod`]) {
    await db.execute({ sql: "INSERT INTO user (id) VALUES (?)", args: [id] });
  }

  extractAndSaveTopicsFromNotes = (await import("@/lib/research/agent")).extractAndSaveTopicsFromNotes;
  createTopic = (await import("@/lib/topics/bank")).createTopic;
});

const modelReturning = (candidates: unknown[]) =>
  new MockLanguageModelV4({ doGenerate: async () => result(JSON.stringify({ candidates })) });

const candidate = (title: string) => ({
  title,
  category: "evergreen",
  targetAudienceFit: "Relevan buat developer junior yang baru pegang backend.",
});

describe("research agent extraction", () => {
  it("saves candidates with the requested status and source", async () => {
    const model = modelReturning([candidate("Kenapa Index Database Bikin Query Cepat")]);
    const { saved, skipped } = await extractAndSaveTopicsFromNotes(USER, model, "catatan", {
      status: "pending_review",
      source: "research-agent-mvp",
    });

    expect(saved).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(saved[0].status).toBe("pending_review");
    expect(saved[0].source).toBe("research-agent-mvp");
  });

  // The batch generator deduped from day one; this path never did, even though pasting
  // the same working notes twice is exactly how it gets used.
  it("skips a candidate that already exists in the bank", async () => {
    const user = `${USER}-dup`;
    await createTopic({
      userId: user,
      title: "JWT Itu Bukan Enkripsi",
      category: "evergreen",
      status: "idea",
    });

    const model = modelReturning([candidate("JWT Itu Bukan Enkripsi")]);
    const { saved, skipped } = await extractAndSaveTopicsFromNotes(user, model, "catatan");

    expect(saved).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].matchedWith).toBe("JWT Itu Bukan Enkripsi");
  });

  it("skips a near-duplicate inside a single paste", async () => {
    const user = `${USER}-intra`;
    const model = modelReturning([
      candidate("Cara Kerja Message Queue untuk Pemula"),
      candidate("Cara Kerja Message Queue buat Pemula"),
    ]);
    const { saved, skipped } = await extractAndSaveTopicsFromNotes(user, model, "catatan");

    expect(saved).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it("clears a product link that points at no real product", async () => {
    const user = `${USER}-prod`;
    const model = modelReturning([
      {
        title: "Bikin Portfolio 3D yang Dilirik Recruiter",
        category: "product",
        targetAudienceFit: "Junior dev butuh portfolio yang menonjol.",
        relatedProductId: "prod_does_not_exist",
        suggestedAngle: "Tunjukkan proses, bukan hasil.",
      },
    ]);
    const { saved } = await extractAndSaveTopicsFromNotes(user, model, "catatan");

    expect(saved).toHaveLength(1);
    expect(saved[0].relatedProductId).toBeUndefined();
    expect(saved[0].category).toBe("evergreen");
  });
});
