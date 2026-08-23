import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaptureJob,
  finishCaptureJob,
  failCaptureJob,
  readCaptureJob,
  _resetCaptureJobs,
} from "@/services/capture-jobs";

/**
 * Capture used to render, upload and reply on one connection. That connection lived as
 * long as the work — 269 seconds measured for a five-slide deck, most of it Cloudinary
 * retries against a degraded uplink — and Cloudflare closes an origin connection at 100
 * seconds, so the browser got a 524 while the slides were already uploaded.
 */
beforeEach(() => _resetCaptureJobs());

describe("capture job store", () => {
  it("starts pending and can be read back by its owner", () => {
    const id = createCaptureJob("u1");
    expect(readCaptureJob(id, "u1")).toMatchObject({ status: "pending" });
  });

  it("carries the result through to the poller", () => {
    const id = createCaptureJob("u1");
    finishCaptureJob(id, { urls: ["https://cdn/a", "https://cdn/b"], images: [] });
    const job = readCaptureJob(id, "u1");
    expect(job).toMatchObject({ status: "done", urls: ["https://cdn/a", "https://cdn/b"] });
  });

  it("carries the base64 fallback when the upload failed", () => {
    const id = createCaptureJob("u1");
    finishCaptureJob(id, { urls: [], images: ["b64"], uploadError: "socket hang up" });
    expect(readCaptureJob(id, "u1")).toMatchObject({
      status: "done",
      images: ["b64"],
      uploadError: "socket hang up",
    });
  });

  it("reports a failure instead of leaving the poller pending forever", () => {
    const id = createCaptureJob("u1");
    failCaptureJob(id, "No slide <section> elements found to export");
    expect(readCaptureJob(id, "u1")).toMatchObject({ status: "error" });
  });

  /**
   * A job id is a bearer token for a deck someone paid a Chromium render for. Another
   * session asking for it gets the same answer as one asking for an id that never
   * existed — the client's response to both is identical, so distinguishing them would
   * only leak that the id is real.
   */
  it("does not hand a job to another session", () => {
    const id = createCaptureJob("u1");
    finishCaptureJob(id, { urls: ["https://cdn/a"], images: [] });
    expect(readCaptureJob(id, "u2")).toBeNull();
  });

  it("answers null for an id it never issued", () => {
    expect(readCaptureJob(crypto.randomUUID(), "u1")).toBeNull();
  });

  it("ignores a result for a job that is gone, rather than resurrecting it", () => {
    // The process can restart under an in-flight capture; the settle call must not
    // recreate a job whose poller has long since given up.
    const id = createCaptureJob("u1");
    _resetCaptureJobs();
    finishCaptureJob(id, { urls: ["https://cdn/a"], images: [] });
    failCaptureJob(id, "boom");
    expect(readCaptureJob(id, "u1")).toBeNull();
  });

  it("keeps jobs apart", () => {
    const a = createCaptureJob("u1");
    const b = createCaptureJob("u1");
    expect(a).not.toBe(b);
    finishCaptureJob(a, { urls: ["https://cdn/a"], images: [] });
    expect(readCaptureJob(b, "u1")).toMatchObject({ status: "pending" });
  });
});
