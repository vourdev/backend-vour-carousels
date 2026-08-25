import { Hono } from "hono";
import {
  normalizeUploadedEvidence,
  EvidenceUploadError,
  MAX_UPLOAD_BYTES,
} from "../../lib/evidence/normalize";
import { logEvidenceAttempt } from "../../lib/evidence/log";

/**
 * Human upload for a screenshot the automatic path could not get.
 *
 * The wizard shows the form for exactly the slides `/api/plan` reported as unfulfilled —
 * each attempt in that response carries the `slideIndex` it belongs to and why it failed.
 * The file is shaped here rather than in the browser for the reason the frontend holds no
 * prompts and no publishing code: cropping, capping and re-encoding evidence is this
 * service's contract, and the second copy that lived in the wizard drifted from it
 * immediately — centre-anchored where this is top-anchored, 1080px where this is 2048,
 * quality 0.8 where this is 0.9. Which crop you got depended on which path filled the
 * slide.
 *
 * Only the image crosses the wire. The plan stays in the wizard, where every other edit
 * to it already lives.
 */
const app = new Hono<{ Variables: { session: any } }>();

interface UploadRequest {
  /** `data:image/png;base64,…` straight from a FileReader in the browser. */
  dataUrl: string;
  /** The slide's `screenshotBrief.cropRatio`. Defaults to the deck's 4:5. */
  cropRatio?: string;
  /** Which slide it is for — recorded in the audit log, not used to shape the image. */
  slideIndex?: number;
  /** What the brief asked for, so the log reads the same as an automatic attempt. */
  source?: string;
}

app.post("/upload", async (c) => {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES * 1.4) {
    return c.json({ error: "Gambar terlalu besar (maksimal 12 MB)." }, 413);
  }

  const { dataUrl, cropRatio, slideIndex, source } = (await c.req.json()) as UploadRequest;
  if (!dataUrl) return c.json({ error: "Missing dataUrl" }, 400);

  let normalized;
  try {
    normalized = await normalizeUploadedEvidence(dataUrl, cropRatio);
  } catch (err) {
    if (err instanceof EvidenceUploadError) return c.json({ error: err.message, code: err.code }, 400);
    throw err;
  }

  // Uploads land in the same audit trail as automatic attempts: "how often does a person
  // have to step in, and for which sources" is the same question as "which sites fail".
  await logEvidenceAttempt({
    path: "user-upload",
    entity: source?.trim() || "manual upload",
    outcome: "captured",
    reason: normalized.warning,
    metrics: { ...normalized.metrics, width: normalized.width, height: normalized.height },
    slideIndex,
  });

  return c.json({
    dataUrl: normalized.dataUrl,
    width: normalized.width,
    height: normalized.height,
    bytes: normalized.bytes,
    warning: normalized.warning,
  });
});

export default app;
