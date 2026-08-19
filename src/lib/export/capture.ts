import { toBlob } from "html-to-image";
import { inlineFontFaceCss } from "../ds/fonts-inline";

const SLIDE_W = 1080;
const SLIDE_H = 1350;
const READY_TIMEOUT_MS = 4000;

/** Resolve when `p` settles or after `ms` — never hangs. */
function withTimeout(p: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([
    p.then(() => undefined),
    new Promise<void>((r) => setTimeout(r, ms)),
  ]);
}

/** Load an assembled carousel document in a hidden, real-size iframe. */
function mountHiddenIframe(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: `${SLIDE_W}px`,
      height: `${SLIDE_H}px`,
      border: "0",
      opacity: "0.01",
      pointerEvents: "none",
      zIndex: "-9999",
    });
    // Fallback in case onload never fires.
    const timer = setTimeout(() => resolve(iframe), READY_TIMEOUT_MS);
    iframe.onload = () => {
      clearTimeout(timer);
      resolve(iframe);
    };
    iframe.onerror = () => {
      clearTimeout(timer);
      reject(new Error("export iframe failed to load"));
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

/** Wait for fonts to load — capped so it can never hang. */
async function waitForReady(doc: Document): Promise<void> {
  await withTimeout(doc.fonts.ready, READY_TIMEOUT_MS);
  // Settle time for layout + paint.
  await new Promise<void>((r) => setTimeout(r, 100));
}

export async function captureCarousel(
  html: string,
  opts: { pixelRatio?: number; quality?: number } = {}
): Promise<Blob[]> {
  const pixelRatio = opts.pixelRatio ?? 1;

  const iframe = await mountHiddenIframe(html);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("export iframe has no document");

    await waitForReady(doc);

    const sections = Array.from(doc.querySelectorAll("section")) as HTMLElement[];
    if (!sections.length) throw new Error("no slides found to export");

    const blobs: Blob[] = [];
    for (const section of sections) {
      const blob = await toBlob(section, {
        type: "image/png",
        pixelRatio,
        width: SLIDE_W,
        height: SLIDE_H,
        skipFonts: false,
        // html-to-image's automatic used-font detection walks the cloned
        // tree checking `child instanceof HTMLElement` — but `HTMLElement`
        // here resolves to the *parent* window's constructor while the
        // slide DOM lives in this hidden iframe's own realm, so the check
        // is always false and traversal never descends past <section>.
        // Only the section's own inherited font-family (Nunito) ends up
        // "used", so every other embedded font (Sora, JetBrains Mono) gets
        // silently dropped from the exported image — text falls back to
        // the browser's default serif. Passing fontEmbedCSS explicitly
        // skips that broken auto-detection entirely.
        fontEmbedCSS: inlineFontFaceCss,
      });
      if (!blob) throw new Error("html-to-image returned no blob");
      blobs.push(blob);
    }
    return blobs;
  } finally {
    iframe.remove();
  }
}
