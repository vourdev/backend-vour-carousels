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

/**
 * Ceiling on a single database round trip.
 *
 * undici waits 10s to open a connection, so on a degraded link one lost SYN
 * costs ten seconds before the retry above even starts — and better-auth looks
 * up a session on every authenticated request. Measured 23 Aug 2026: ten
 * sequential queries came back in 120ms-12.1s, so most are fast and the tail is
 * very long. Cutting the tail short and retrying beats waiting it out: a fresh
 * connection usually lands in well under a second.
 */
const DB_REQUEST_TIMEOUT_MS = Number(process.env.DB_REQUEST_TIMEOUT_MS ?? 5000);

/** The connection settings every store in this app shares. */
export function dbConfig(): Config {
  const url = process.env.DATABASE_URL ?? "file:local-auth.db";
  const config: Config = { url, authToken: process.env.DATABASE_AUTH_TOKEN };

  // A `file:` database never touches the network, so a deadline there would only
  // add a way to fail.
  if (!url.startsWith("file:")) {
    config.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const deadline = AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS);
      const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
      return fetch(input, { ...init, signal });
    };
  }

  return config;
}
