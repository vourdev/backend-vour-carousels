import { describe, it, expect, vi } from "vitest";
import { withRetryingClient } from "@/lib/libsql";

/**
 * Every repo in this codebase builds its own libsql client and calls
 * `execute`/`batch` directly, and better-auth reaches the same database through
 * the kysely dialect. Wrapping the client is the one place that covers all of
 * them at once, without changing a single call site's semantics.
 */

function undiciTimeout() {
  const err = new TypeError("fetch failed");
  (err as any).cause = Object.assign(new Error("Connect Timeout Error"), {
    code: "UND_ERR_CONNECT_TIMEOUT",
  });
  return err;
}

function stubClient(overrides: Record<string, any> = {}) {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    batch: vi.fn().mockResolvedValue([]),
    executeMultiple: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    closed: false,
    ...overrides,
  } as any;
}

const fast = { sleep: () => Promise.resolve() };

describe("withRetryingClient", () => {
  it("passes a successful execute straight through", async () => {
    const inner = stubClient();
    const client = withRetryingClient(inner, fast);

    await expect(client.execute("SELECT 1")).resolves.toEqual({ rows: [] });
    expect(inner.execute).toHaveBeenCalledTimes(1);
    expect(inner.execute).toHaveBeenCalledWith("SELECT 1");
  });

  it("retries execute through a connect timeout", async () => {
    const inner = stubClient({
      execute: vi.fn().mockRejectedValueOnce(undiciTimeout()).mockResolvedValue({ rows: [1] }),
    });
    const client = withRetryingClient(inner, fast);

    await expect(client.execute("SELECT 1")).resolves.toEqual({ rows: [1] });
    expect(inner.execute).toHaveBeenCalledTimes(2);
  });

  // A spare "?" in an INSERT is rejected identically on every attempt. Retrying
  // it would have tripled the time the automation took to fail on 21 Aug.
  it("does not retry a statement the server rejected", async () => {
    const inner = stubClient({
      execute: vi.fn().mockRejectedValue(new Error("SQLITE_UNKNOWN: 15 values for 14 columns")),
    });
    const client = withRetryingClient(inner, fast);

    await expect(client.execute("INSERT ...")).rejects.toThrow("15 values for 14 columns");
    expect(inner.execute).toHaveBeenCalledTimes(1);
  });

  it("retries batch and executeMultiple too", async () => {
    const inner = stubClient({
      batch: vi.fn().mockRejectedValueOnce(undiciTimeout()).mockResolvedValue(["ok"]),
      executeMultiple: vi.fn().mockRejectedValueOnce(undiciTimeout()).mockResolvedValue(undefined),
    });
    const client = withRetryingClient(inner, fast);

    await expect(client.batch([])).resolves.toEqual(["ok"]);
    await expect(client.executeMultiple("")).resolves.toBeUndefined();
    expect(inner.batch).toHaveBeenCalledTimes(2);
    expect(inner.executeMultiple).toHaveBeenCalledTimes(2);
  });

  it("leaves non-retryable members reachable and bound to the inner client", async () => {
    const inner = stubClient();
    const client = withRetryingClient(inner, fast);

    client.close();
    expect(inner.close).toHaveBeenCalledTimes(1);
    expect(client.closed).toBe(false);
  });

  // transaction() hands back a stateful handle; replaying the call after a
  // failure could commit work twice, so it is deliberately left alone.
  it("does not wrap transaction()", async () => {
    const transaction = vi.fn().mockRejectedValue(undiciTimeout());
    const client = withRetryingClient(stubClient({ transaction }), fast);

    await expect((client as any).transaction()).rejects.toThrow("fetch failed");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
