import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { omnirouteGate } from "../../src/services/omniroute-gate";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("omnirouteGate", () => {
  const saved = {
    max: process.env.OMNIROUTE_MAX_CONCURRENT,
    interval: process.env.OMNIROUTE_MIN_INTERVAL_MS,
  };

  beforeEach(() => {
    omnirouteGate.resetForTests();
    // Spacing is exercised in its own case; elsewhere it would just make tests slow.
    process.env.OMNIROUTE_MIN_INTERVAL_MS = "1";
  });

  afterEach(() => {
    if (saved.max === undefined) delete process.env.OMNIROUTE_MAX_CONCURRENT;
    else process.env.OMNIROUTE_MAX_CONCURRENT = saved.max;
    if (saved.interval === undefined) delete process.env.OMNIROUTE_MIN_INTERVAL_MS;
    else process.env.OMNIROUTE_MIN_INTERVAL_MS = saved.interval;
  });

  it("never runs more than one request at a time by default", async () => {
    delete process.env.OMNIROUTE_MAX_CONCURRENT;

    let inFlight = 0;
    let peak = 0;
    const call = () =>
      omnirouteGate.run(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await sleep(10);
        inFlight--;
      });

    // The shape of the automation path: two decks, briefs fired at the same instant.
    await Promise.all([call(), call(), call(), call()]);

    expect(peak).toBe(1);
  });

  it("honours a raised concurrency limit", async () => {
    process.env.OMNIROUTE_MAX_CONCURRENT = "2";

    let inFlight = 0;
    let peak = 0;
    const call = () =>
      omnirouteGate.run(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await sleep(10);
        inFlight--;
      });

    await Promise.all([call(), call(), call(), call()]);

    expect(peak).toBe(2);
  });

  it("spaces request starts by the minimum interval", async () => {
    process.env.OMNIROUTE_MAX_CONCURRENT = "4";
    process.env.OMNIROUTE_MIN_INTERVAL_MS = "40";

    const starts: number[] = [];
    const call = () =>
      omnirouteGate.run(async () => {
        starts.push(Date.now());
      });

    await Promise.all([call(), call(), call()]);

    expect(starts).toHaveLength(3);
    // Two gaps, each at least the interval. Timers overshoot, never undershoot, but give
    // a few ms of slack so a loaded CI box cannot fail this on rounding alone.
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(35);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(35);
  });

  it("releases the slot when the request throws", async () => {
    delete process.env.OMNIROUTE_MAX_CONCURRENT;

    await expect(
      omnirouteGate.run(async () => {
        throw new Error("upstream 502");
      })
    ).rejects.toThrow("upstream 502");

    // A leaked slot would make this hang rather than fail, so the assertion is really
    // "this resolves at all" — the counter check just names what went wrong.
    await omnirouteGate.run(async () => undefined);
    expect(omnirouteGate.stats.active).toBe(0);
    expect(omnirouteGate.stats.queued).toBe(0);
  });

  it("preserves each caller's own result and order of completion", async () => {
    delete process.env.OMNIROUTE_MAX_CONCURRENT;

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        omnirouteGate.run(async () => {
          await sleep(5);
          return n * 10;
        })
      )
    );

    expect(results).toEqual([10, 20, 30]);
  });
});
