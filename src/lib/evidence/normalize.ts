import { captureQueue } from "../../services/capture-queue";
import { parseCropRatio } from "./capture-web";
import { analyzeShot, type ShotMetrics } from "./validate";

/**
 * Put a human-uploaded screenshot through the same shaping as an auto-captured one.
 *
 * When the automatic path cannot satisfy a screenshot slide on the wizard, the deck falls
 * back to the "BUTUH SCREENSHOT ASLI" card and a person uploads the real thing. What they
 * hand over is whatever their screenshot tool produced — a 3840×2160 PNG of a whole
 * monitor, a phone grab, a 12 MB lossless file — and dropping that into the plan verbatim
 * puts it through publish, capture and Buffer at that size, in an <img> the design system
 * caps at 480px tall.
 *
 * So it is cropped to the brief's ratio and re-encoded here, exactly as `captureWebEvidence`
 * shapes its own output, and the plan ends up holding the same kind of value either way.
 *
 * This runs in the OFFLINE browser on purpose. It is local pixel work — a data URL, a
 * canvas, no navigation — and `captureQueue` is what already owns a warm Chromium with
 * bounded concurrency. The networked evidence browser is for reaching sites, and nothing
 * here reaches anything.
 */

/** Widest we keep. Matches the auto path's 1024 CSS px at deviceScaleFactor 2. */
const MAX_WIDTH = 2048;
/** 12 MB of data URL. Bigger than any real screenshot, small enough to refuse politely. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface NormalizedEvidence {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  /** The same numbers the auto path judges by — returned as advice, never enforced. */
  metrics: ShotMetrics;
  /** Set when the picture looks blank or flat. The person still decides. */
  warning?: "mostly-blank" | "flat-overlay";
}

const ACCEPTED = /^data:image\/(png|jpe?g|webp|avif);base64,/i;

/**
 * Crop-to-cover, anchored top-centre.
 *
 * Top rather than centre because a screenshot's evidence is almost always at the top —
 * the URL bar, the error banner, the headline number. Centre-cropping a tall page grab
 * throws exactly that away.
 */
const SHAPE = (ratio: number, maxWidth: number) => `(async () => {
  const img = document.getElementById("upload");
  await img.decode();
  const sw = img.naturalWidth, sh = img.naturalHeight;
  if (!sw || !sh) throw new Error("image has no dimensions");

  const RATIO = ${ratio};
  let cw = sw, ch = Math.round(sw / RATIO);
  if (ch > sh) { ch = sh; cw = Math.round(sh * RATIO); }
  const sx = Math.round((sw - cw) / 2);
  const sy = 0;

  const outW = Math.min(cw, ${maxWidth});
  const outH = Math.round(outW / RATIO);

  const c = document.createElement("canvas");
  c.width = outW; c.height = outH;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  // A screenshot is mostly flat colour and text; white behind it keeps any alpha from
  // rendering as black once it is flattened into a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, outW, outH);
  return { dataUrl: c.toDataURL("image/jpeg", 0.9), width: outW, height: outH };
})()`;

export class EvidenceUploadError extends Error {
  constructor(message: string, readonly code: "too-large" | "unsupported" | "undecodable") {
    super(message);
    this.name = "EvidenceUploadError";
  }
}

export async function normalizeUploadedEvidence(
  dataUrl: string,
  cropRatio?: string
): Promise<NormalizedEvidence> {
  if (typeof dataUrl !== "string" || !ACCEPTED.test(dataUrl)) {
    throw new EvidenceUploadError(
      "Format tidak didukung. Kirim PNG, JPEG, WebP atau AVIF sebagai data URL.",
      "unsupported"
    );
  }
  if (dataUrl.length > MAX_UPLOAD_BYTES) {
    throw new EvidenceUploadError("Gambar terlalu besar (maksimal 12 MB).", "too-large");
  }

  const ratio = parseCropRatio(cropRatio);

  return captureQueue.capture(async (browser) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // The upload is drawn, never executed: it enters the page as an <img> src on a
      // blank document, so nothing in the file can run even if it is not really an image.
      await page.setContent(`<body style="margin:0"><img id="upload" src="${dataUrl}"></body>`);

      let shaped: { dataUrl: string; width: number; height: number };
      try {
        shaped = await page.evaluate<{ dataUrl: string; width: number; height: number }>(
          SHAPE(ratio, MAX_WIDTH)
        );
      } catch (err) {
        throw new EvidenceUploadError(
          "Gambar tidak bisa dibaca — file-nya mungkin rusak.",
          "undecodable"
        );
      }

      const bytes = Math.floor((shaped.dataUrl.length - shaped.dataUrl.indexOf(",") - 1) * 0.75);
      const metrics = await analyzeShot(browser, Buffer.from(shaped.dataUrl.split(",")[1], "base64"));

      // Advice, not a gate. On this path a person looked at the picture and chose it; the
      // automatic thresholds exist for the path where nobody did.
      let warning: NormalizedEvidence["warning"];
      if (metrics.nearWhitePct > 0.85) warning = "mostly-blank";
      else if (metrics.dominantPct > 0.92) warning = "flat-overlay";

      return { dataUrl: shaped.dataUrl, width: shaped.width, height: shaped.height, bytes, metrics, warning };
    } finally {
      await context.close().catch(() => {});
    }
  });
}
