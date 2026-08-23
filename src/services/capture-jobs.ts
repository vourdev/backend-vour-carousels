/**
 * Capture, decoupled from the request that asked for it.
 *
 * A five-slide deck measured 269 seconds end to end on this VPS: the Chromium render is
 * quick, but more than half the Cloudinary uploads fail on the first attempt against a
 * link dropping a large share of its packets, and every failure costs a timeout before
 * the retry. Cloudflare closes an origin connection at 100 seconds and answers 524, so
 * the browser never saw a result no matter how well the render went.
 *
 * Nothing here makes the upload faster. It makes the HTTP request short: the caller gets
 * a job id immediately and polls, so no single connection has to outlive the work.
 *
 * State is in memory on purpose. The service runs one replica, a job lives a few minutes,
 * and the result that actually matters is already durable — /api/capture writes the URLs
 * onto the carousel row. A restart mid-capture therefore loses the poll, not the deck:
 * the client gets `unknown` back and can either re-read the row or export again. A table
 * would buy very little and would put the degraded link back in the middle of the thing
 * meant to survive it.
 */

export interface CaptureSuccess {
  urls: string[];
  images: string[];
  uploadError?: string;
}

export type CaptureJob =
  | { status: "pending"; userId: string; startedAt: number }
  | ({ status: "done"; userId: string; finishedAt: number } & CaptureSuccess)
  | { status: "error"; userId: string; finishedAt: number; error: string };

/**
 * How long a finished job stays readable.
 *
 * Long enough that a client which lost its connection mid-poll can still come back for
 * the answer, short enough that a day of exports cannot accumulate megabytes of base64
 * in the fallback path. Pending jobs are swept on a much longer clock — a capture that
 * is genuinely still running must never be collected out from under its own poller.
 */
const DONE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 30 * 60 * 1000;

const jobs = new Map<string, CaptureJob>();

function sweep(now: number): void {
  for (const [id, job] of jobs) {
    const age = now - (job.status === "pending" ? job.startedAt : job.finishedAt);
    if (age > (job.status === "pending" ? PENDING_TTL_MS : DONE_TTL_MS)) jobs.delete(id);
  }
}

export function createCaptureJob(userId: string): string {
  const now = Date.now();
  sweep(now);
  const id = crypto.randomUUID();
  jobs.set(id, { status: "pending", userId, startedAt: now });
  return id;
}

export function finishCaptureJob(id: string, result: CaptureSuccess): void {
  const job = jobs.get(id);
  if (!job) return; // swept, or the process restarted under it
  jobs.set(id, { status: "done", userId: job.userId, finishedAt: Date.now(), ...result });
}

export function failCaptureJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { status: "error", userId: job.userId, finishedAt: Date.now(), error });
}

/**
 * Read a job back, scoped to its owner.
 *
 * A job id is a bearer token for a deck the user paid a Chromium render for, so another
 * session asking for it gets the same answer as one asking for an id that never existed.
 * Returning "unknown" rather than 403 also keeps the client's handling of a swept job and
 * a restarted process identical, which is what it should do about both: export again.
 */
export function readCaptureJob(id: string, userId: string): CaptureJob | null {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}

/** Test seam. */
export function _resetCaptureJobs(): void {
  jobs.clear();
}
