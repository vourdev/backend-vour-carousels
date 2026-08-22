/**
 * Retry for calls that cross the network.
 *
 * Every Turso query is an HTTPS round trip from a VPS whose uplink drops a
 * large share of its packets during provider incidents. A lost SYN surfaces as
 * `UND_ERR_CONNECT_TIMEOUT` ten seconds later and fails the whole request,
 * while the next attempt typically completes in under two seconds. One retry
 * converts most of those failures into successes.
 *
 * The narrow error test matters as much as the retry: a statement SQLite
 * rejects fails the same way every time, so retrying it only multiplies the
 * latency before the caller sees the identical error.
 */

/** Socket- and DNS-level failures that say nothing about the request itself. */
const TRANSIENT_CODES = new Set([
  // undici / fetch
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_RESPONSE_STATUS_CODE",
  // node sockets
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  // dns
  "EAI_AGAIN",
  "ENOTFOUND",
]);

const MAX_CAUSE_DEPTH = 8;

/**
 * True when the failure is the network rather than the query.
 *
 * undici reports a dead connection as a plain `TypeError: fetch failed` and
 * hides the real code on `.cause`; libsql and better-auth then wrap that again.
 * So the chain is walked rather than just the top-level error.
 */
export function isTransientNetworkError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: any = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== "object") return false;
    if (seen.has(current)) return false; // self-referential cause
    seen.add(current);

    const code = current.code;
    if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;

    // undici's outermost error carries no code at all.
    if (typeof current.message === "string" && current.message.includes("fetch failed")) return true;

    if (!("cause" in current)) return false;
    current = current.cause;
  }

  return false;
}

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Delay before the first retry; doubles each time. Default 200ms. */
  baseDelayMs?: number;
  /** Ceiling for the doubling. Default 2000ms. */
  maxDelayMs?: number;
  /** Called before each retry, so an incident is visible in the logs. */
  onRetry?: (err: unknown, attempt: number) => void;
  /** Injected in tests so the suite does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 2000,
    onRetry,
    sleep = defaultSleep,
  } = opts;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // A query the server rejected will be rejected again; fail fast.
      if (!isTransientNetworkError(err)) throw err;
      if (attempt === attempts) break;

      onRetry?.(err, attempt);
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }

  throw lastErr;
}
