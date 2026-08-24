/**
 * One queue in front of every OmniRoute HTTP call.
 *
 * OmniRoute fans a single request out across a combo of upstream models, so a request
 * costs it far more than one API call. Firing several at once does not get answers back
 * faster — the work piles up in its queue and every one of them slows down together.
 * `/automation/generate` was the worst offender: two decks run through
 * `Promise.allSettled`, so brief-1 and brief-2 left at the same instant, then plan-1 and
 * plan-2, doubling the depth of that queue for no gain in wall-clock time.
 *
 * The gate sits at the transport, not at `generateBrief`/`generateSlidePlan`, for two
 * reasons. The AI SDK retries failed calls internally (three attempts with backoff), and
 * those retries are exactly the traffic worth spacing out — a wrapper one level up never
 * sees them. And every caller reaches OmniRoute through the same custom `fetch`, so the
 * topic generator and the research agent are covered without either of them knowing.
 *
 * Two knobs, both env-tunable:
 *  - `OMNIROUTE_MAX_CONCURRENT` (default 1) — how many requests may be in flight.
 *  - `OMNIROUTE_MIN_INTERVAL_MS` (default 1000) — minimum spacing between request starts,
 *    which is what keeps a burst of short calls from arriving as a burst even when the
 *    concurrency limit is raised.
 *
 * This trades wall-clock time for queue depth on purpose. Serialising the two decks makes
 * the nightly run longer, and the n8n node timeout has to allow for that.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class OmniRouteGate {
  private active = 0;
  private waiters: Array<() => void> = [];
  private lastStart = 0;
  private peakQueued = 0;
  private admitted = 0;

  /** Read per-call, not cached: the env is set by the swarm service, not by a build. */
  private get maxConcurrent(): number {
    return envInt("OMNIROUTE_MAX_CONCURRENT", 1);
  }

  private get minIntervalMs(): number {
    return envInt("OMNIROUTE_MIN_INTERVAL_MS", 1000);
  }

  private async acquire(): Promise<void> {
    // A loop rather than a single `if`: a caller arriving between the release and the
    // woken waiter's turn would otherwise take the slot and both would proceed, putting
    // one more request in flight than the limit allows.
    let waited = 0;
    while (this.active >= this.maxConcurrent) {
      this.peakQueued = Math.max(this.peakQueued, this.waiters.length + 1);
      if (!waited) waited = Date.now();
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    // Only requests that actually had to wait log, so a healthy run is silent and a
    // night where the queue backed up says so in the container logs.
    if (waited) console.log(`[omniroute] request waited ${Date.now() - waited}ms for a slot`);
    this.active++;

    // Claim the slot before waiting for it, not after. Two callers that both read
    // `lastStart` and then slept would wake at the same instant and leave together,
    // which is the burst this exists to prevent.
    const now = Date.now();
    const startAt = Math.max(now, this.lastStart + this.minIntervalMs);
    this.lastStart = startAt;
    if (startAt > now) await sleep(startAt - now);
    this.admitted++;
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get stats() {
    return {
      active: this.active,
      queued: this.waiters.length,
      peakQueued: this.peakQueued,
      admitted: this.admitted,
      maxConcurrent: this.maxConcurrent,
      minIntervalMs: this.minIntervalMs,
    };
  }

  /** Tests only: drop accumulated counters and spacing so cases do not leak into each other. */
  resetForTests(): void {
    this.active = 0;
    this.waiters = [];
    this.lastStart = 0;
    this.peakQueued = 0;
    this.admitted = 0;
  }
}

export const omnirouteGate = new OmniRouteGate();
