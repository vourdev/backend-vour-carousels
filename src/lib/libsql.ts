import { createClient, type Client, type Config } from "@libsql/client";
import { withRetry, type RetryOptions } from "./retry";

/**
 * A libsql client that survives a lossy uplink.
 *
 * Turso is reached over HTTPS, so on a link dropping ~45% of its packets a
 * query fails not because it is wrong but because the connection never opened.
 * Wrapping the client covers every caller at once: the four repos that call
 * `execute` directly, and better-auth, which reaches the same database through
 * the kysely dialect and would otherwise turn one dropped packet into a 500 on
 * the session lookup.
 *
 * `transaction()` is deliberately not wrapped — it returns a stateful handle,
 * and replaying the call after a partial failure risks committing twice.
 */

/** Methods that are a single self-contained round trip, so replaying is safe. */
const RETRYABLE = new Set(["execute", "batch", "executeMultiple", "migrate"]);

export function withRetryingClient(client: Client, opts: RetryOptions = {}): Client {
  const retryOpts: RetryOptions = {
    onRetry: (err, attempt) =>
      console.warn(
        `[libsql] transient failure, retrying (attempt ${attempt}):`,
        err instanceof Error ? err.message : err
      ),
    ...opts,
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== "function" || typeof prop !== "string" || !RETRYABLE.has(prop)) {
        // Bind functions so `close()` and friends keep their receiver.
        return typeof value === "function" ? value.bind(target) : value;
      }

      return (...args: unknown[]) =>
        withRetry(() => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args), retryOpts);
    },
  }) as Client;
}

export function createRetryingClient(config: Config, opts: RetryOptions = {}): Client {
  return withRetryingClient(createClient(config), opts);
}

/** The connection settings every store in this app shares. */
export function dbConfig(): Config {
  return {
    url: process.env.DATABASE_URL ?? "file:local-auth.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  };
}
