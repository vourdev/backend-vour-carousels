import { LibsqlDialect } from "@libsql/kysely-libsql";

// Auth-only store. `file:` for local/dev, Turso `libsql://…` in prod.
export const dialect = new LibsqlDialect({
  url: process.env.DATABASE_URL ?? "file:local-auth.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
