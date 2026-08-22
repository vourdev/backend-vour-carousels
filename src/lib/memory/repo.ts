import type { Client } from "@libsql/client";
import { createRetryingClient, dbConfig } from "../libsql";

/**
 * Revision memory for an in-progress carousel draft.
 *
 * Gate 1 and Gate 2 revisions used to be stateless: each call handed the model
 * only the current brief/plan plus one instruction. Asking for a second change
 * to the same slide therefore arrived with no record that the first change was
 * ever requested, so the model happily undid it or re-applied it to the wrong
 * target. Every revision turn is recorded here and replayed into the prompt.
 *
 * Keyed on `draft_id`, not the carousel id: a carousel row is only created at
 * export time, while revisions start at Gate 1. The wizard mints the draft id
 * when a draft begins and keeps it in the saved draft.
 *
 * Lifetime ends with the draft: the log is dropped once the content is
 * scheduled to Buffer or saved to stock, since there is nothing left to revise.
 */

export type RevisionStage = "brief" | "plan";

export interface RevisionTurn {
  id: string;
  userId: string;
  draftId: string;
  stage: RevisionStage;
  /** What the user asked for, verbatim. */
  request: string;
  /** What actually changed, as a short note the next revision can read. */
  outcome: string | null;
  createdAt: number;
}

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

function db(): Client {
  if (!client) {
    client = createRetryingClient(dbConfig());
  }
  return client;
}

/** Create the table once per process (shares the Better Auth db). */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db().execute(`CREATE TABLE IF NOT EXISTS revision_memory (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        request TEXT NOT NULL,
        outcome TEXT,
        created_at INTEGER NOT NULL
      )`);
      await db().execute(
        `CREATE INDEX IF NOT EXISTS idx_revision_memory_draft
         ON revision_memory(user_id, draft_id, created_at)`
      );
    })();
  }
  return schemaReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToTurn(r: any): RevisionTurn {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    draftId: String(r.draft_id),
    stage: r.stage as RevisionStage,
    request: String(r.request),
    outcome: r.outcome ?? null,
    createdAt: Number(r.created_at),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Hard cap so one runaway draft cannot grow the prompt without bound. */
export const MAX_REMEMBERED_TURNS = 20;

export async function appendRevision(input: {
  userId: string;
  draftId: string;
  stage: RevisionStage;
  request: string;
  outcome?: string | null;
}): Promise<RevisionTurn> {
  await ensureSchema();
  const now = Date.now();
  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO revision_memory (id, user_id, draft_id, stage, request, outcome, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.userId, input.draftId, input.stage, input.request, input.outcome ?? null, now],
  });
  return {
    id,
    userId: input.userId,
    draftId: input.draftId,
    stage: input.stage,
    request: input.request,
    outcome: input.outcome ?? null,
    createdAt: now,
  };
}

/**
 * Oldest-first, so the prompt reads as a chronology. Only the newest
 * MAX_REMEMBERED_TURNS survive: the tail is selected newest-first in SQL, then
 * flipped, so a long draft keeps its RECENT history rather than its first turns.
 *
 * Ordered by rowid, not created_at: consecutive revisions land in the same
 * millisecond, and a random-uuid tiebreak would then shuffle turns and hand the
 * model a scrambled chronology. rowid is SQLite's insertion order.
 */
export async function listRevisions(
  userId: string,
  draftId: string,
  stage?: RevisionStage
): Promise<RevisionTurn[]> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT * FROM revision_memory
          WHERE user_id = ? AND draft_id = ?${stage ? " AND stage = ?" : ""}
          ORDER BY rowid DESC
          LIMIT ?`,
    args: stage
      ? [userId, draftId, stage, MAX_REMEMBERED_TURNS]
      : [userId, draftId, MAX_REMEMBERED_TURNS],
  });
  return res.rows.map(rowToTurn).reverse();
}

/** Drop the whole log for a draft. Called when the draft is published, stocked, or reset. */
export async function clearRevisions(userId: string, draftId: string): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: `DELETE FROM revision_memory WHERE user_id = ? AND draft_id = ?`,
    args: [userId, draftId],
  });
}
