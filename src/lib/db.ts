import { LibsqlDialect } from "@libsql/kysely-libsql";
import { createRetryingClient, dbConfig } from "./libsql";

// Auth-only store. `file:` for local/dev, Turso `libsql://…` in prod.
//
// The dialect is handed an explicit client rather than a URL so session lookups
// inherit the same retry behaviour as every other query. Without it a single
// dropped packet on the way to Turso makes better-auth throw, the auth
// middleware answer 500, and the Next.js app surface it as
// "Internal Server Error in Auth Middleware".
//
// The cast bridges a duplicated dependency, not a real mismatch:
// @libsql/kysely-libsql pins its own older @libsql/core, whose `Client.sync()`
// is typed `Promise<void>` where ours is `Promise<Replicated>`. Both resolve to
// the same implementation at runtime.
export const dialect = new LibsqlDialect({
  client: createRetryingClient(dbConfig()) as never,
});
