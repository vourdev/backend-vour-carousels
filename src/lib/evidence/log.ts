import { createClient } from "@libsql/client";

/**
 * An audit trail for every automated screenshot attempt.
 *
 * The whole feature is auto-approved: no human sees the picture before it is posted, so
 * the only way to notice that (say) every capture of a particular site has been silently
 * falling back for a month is to have written the attempts down. Rows are cheap, one per
 * screenshot-bearing slide, and nothing here is on the read path of a deck.
 *
 * Every function swallows its own errors. A logging failure must never be the reason a
 * carousel does not ship.
 */

let clientInstance: ReturnType<typeof createClient> | null = null;

function db() {
  if (!clientInstance) {
    clientInstance = createClient({
      url: process.env.DATABASE_URL ?? "file:local-auth.db",
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return clientInstance;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS web_evidence_log (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  path TEXT NOT NULL,
  slide_index INTEGER,
  entity TEXT NOT NULL,
  host TEXT,
  url TEXT,
  outcome TEXT NOT NULL,
  reason TEXT,
  metrics TEXT,
  duration_ms INTEGER
)`;

let schemaEnsured = false;

/** Columns added after the table shipped. SQLite errors on a duplicate; that is the no-op. */
const MIGRATION_COLUMNS = ["slide_index INTEGER"];

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  await db().execute(SCHEMA);
  for (const col of MIGRATION_COLUMNS) {
    try {
      await db().execute(`ALTER TABLE web_evidence_log ADD COLUMN ${col}`);
    } catch {
      // already there — expected on every boot after the first
    }
  }
  schemaEnsured = true;
}

export type EvidenceOutcome = "captured" | "skipped" | "rejected" | "error";

export interface EvidenceAttempt {
  /**
   * Which caller made the attempt — "automation", "user", or "user-upload" when a person
   * supplied the picture the automatic path could not get.
   */
  path: string;
  entity: string;
  /**
   * Which slide it was for. The wizard reads this to put the upload form on the right
   * slide, so it is part of the response, not just the log.
   */
  slideIndex?: number;
  host?: string;
  url?: string;
  outcome: EvidenceOutcome;
  /** Resolver failure, validator rejection reason, or an error message. */
  reason?: string;
  metrics?: unknown;
  durationMs?: number;
}

/** Write one attempt. Never throws, never blocks a caller that does not await it. */
export async function logEvidenceAttempt(attempt: EvidenceAttempt): Promise<void> {
  const line = `[web-evidence] ${attempt.outcome} entity="${attempt.entity}" host=${attempt.host ?? "-"} reason=${attempt.reason ?? "-"}`;
  if (attempt.outcome === "captured") console.log(line);
  else console.warn(line);

  try {
    await ensureSchema();
    await db().execute({
      sql: `INSERT INTO web_evidence_log
        (id, created_at, path, slide_index, entity, host, url, outcome, reason, metrics, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        Date.now(),
        attempt.path,
        attempt.slideIndex ?? null,
        attempt.entity,
        attempt.host ?? null,
        attempt.url ?? null,
        attempt.outcome,
        attempt.reason ?? null,
        attempt.metrics ? JSON.stringify(attempt.metrics) : null,
        attempt.durationMs ?? null,
      ],
    });
  } catch (err) {
    console.warn("[web-evidence] could not record the attempt (continuing):", err);
  }
}

export interface EvidenceHostStat {
  host: string;
  attempts: number;
  captured: number;
  failed: number;
}

/** "Which sites keep failing" — the question the table exists to answer. */
export async function evidenceFailureStats(limit = 20): Promise<EvidenceHostStat[]> {
  try {
    await ensureSchema();
    const res = await db().execute({
      sql: `SELECT host,
                   COUNT(*) AS attempts,
                   SUM(CASE WHEN outcome = 'captured' THEN 1 ELSE 0 END) AS captured,
                   SUM(CASE WHEN outcome != 'captured' THEN 1 ELSE 0 END) AS failed
            FROM web_evidence_log
            WHERE host IS NOT NULL
            GROUP BY host
            ORDER BY failed DESC, attempts DESC
            LIMIT ?`,
      args: [limit],
    });
    return res.rows.map((r: any) => ({
      host: String(r.host),
      attempts: Number(r.attempts),
      captured: Number(r.captured),
      failed: Number(r.failed),
    }));
  } catch (err) {
    console.warn("[web-evidence] could not read the audit log:", err);
    return [];
  }
}
