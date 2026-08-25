import type { Browser, Page } from "playwright";

/**
 * Screenshot a real web page, over the network.
 *
 * This is the ONLY part of the service that is allowed to reach the internet with a
 * browser, and it is deliberately its own module with its own Chromium.
 * `captureCarousel` / `captureCarouselServer` / `captureQueue` render the finished deck
 * from an HTML string with every asset inlined, and stay offline — a final export that
 * depends on a third party being up is an export that fails at midnight in the cron.
 * Nothing here touches that path: this browser is launched, used and closed on its own,
 * and its output leaves as bytes, not as a URL the renderer would have to fetch.
 */

/**
 * Base width of the capture viewport.
 *
 * 1024 rather than a wider desktop: the shot ends up ~384px wide on the slide (the crop
 * ratio against `.diag-screenshot img`'s 480px ceiling), so every extra pixel of viewport
 * width is a pixel of shrink. 1024 is the narrowest width mainstream sites still lay out
 * as desktop rather than folding to a mobile nav, which makes it the widest usable
 * evidence and the largest readable text at slide scale.
 */
const BASE_WIDTH = 1024;
const NAV_TIMEOUT_MS = 20_000;
const SETTLE_MS = 900;
/** Hard ceiling on one page: a site that hangs must not hold up a deck. */
export const CAPTURE_BUDGET_MS = 35_000;

export interface WebEvidenceMeta {
  url: string;
  finalUrl: string;
  status: number;
  cookieBanner: "none" | "clicked" | "hidden";
  target: string;
  width: number;
  height: number;
}

export interface WebEvidenceShot {
  buffer: Buffer;
  meta: WebEvidenceMeta;
}

/** `"4:5"` -> 0.8. Anything unparseable falls back to the deck's default ratio. */
export function parseCropRatio(ratio: string | undefined): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(ratio ?? "");
  if (!m) return 4 / 5;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!(w > 0) || !(h > 0)) return 4 / 5;
  return w / h;
}

/**
 * Consent dialogs, in the two ways they can be got rid of.
 *
 * Clicking is tried first and is the honest one — it is what a reader would do, and the
 * page then renders in its normal post-consent state. Hiding a known consent container
 * is the fallback for the dialogs whose accept button is inside a shadow root or an
 * iframe we cannot reach; it removes the banner without touching the content behind it.
 */
const ACCEPT_TEXT = /^(accept|accept all|accept cookies|allow all|agree|i agree|got it|ok|okay|understood|setuju|saya setuju|izinkan|terima)\b/i;

const CONSENT_CONTAINERS = [
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  "#CybotCookiebotDialog",
  "#cookiebot",
  ".cc-window",
  ".cookie-banner",
  "#cookie-banner",
  "#cookie-consent",
  ".cookie-consent",
  "#gdpr-cookie-message",
  "[id*='cookie-consent']",
  "[class*='cookie-consent']",
  "[aria-label*='cookie' i][role='dialog']",
];

/**
 * Is something still covering the page?
 *
 * Written as source text for `page.evaluate` for the reason the rest of this repo does
 * it: tsx compiles named functions with an esbuild `__name` helper that does not exist
 * inside the page realm.
 *
 * Two shapes count. A container from the known-library list, and any fixed/sticky element
 * that covers most of the viewport AND talks about cookies — the second catches the
 * bespoke banners nobody's selector list has, without hiding a legitimate full-bleed hero
 * that happens to be fixed.
 */
const BLOCKERS = (selectors: string[]) => `(() => {
  const SELECTORS = ${JSON.stringify(selectors)};
  const vw = window.innerWidth, vh = window.innerHeight;
  const found = [];
  const covers = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 40) return 0;
    const w = Math.min(r.right, vw) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / (vw * vh);
  };
  for (const sel of SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      if (covers(el) > 0.02) found.push(el);
    });
  }
  const CONSENT_WORDS = /cookie|consent|gdpr|privacy|setuju|persetujuan/i;
  document.querySelectorAll("body *").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (covers(el) < 0.35) return;
    if (!CONSENT_WORDS.test(el.textContent || "")) return;
    found.push(el);
  });
  return { count: found.length, hide: ${"${HIDE}"} ? found.map((el) => {
    el.style.setProperty("display", "none", "important");
    return true;
  }).length : 0 };
})()`;

const findBlockers = (selectors: string[]) => BLOCKERS(selectors).replace("${HIDE}", "false");
const hideBlockers = (selectors: string[]) => BLOCKERS(selectors).replace("${HIDE}", "true");

async function countBlockers(page: Page): Promise<number> {
  const res = await page
    .evaluate<{ count: number; hide: number }>(findBlockers(CONSENT_CONTAINERS))
    .catch(() => ({ count: 0, hide: 0 }));
  return res.count;
}

/**
 * Get the consent dialog out of the way, and CHECK that it worked.
 *
 * Clicking accept is tried first and is the honest one — it is what a reader does, and
 * the page then renders in its normal post-consent state. But a click that lands on a
 * button with no handler, or on an overlay intercepting it, leaves the wall exactly where
 * it was; without the re-check afterwards the capture reports "clicked" and photographs a
 * flat sheet of consent dialog. So anything still covering the page after the click is
 * hidden outright, which removes the banner without touching the content behind it.
 */
async function dismissCookieBanner(page: Page): Promise<WebEvidenceMeta["cookieBanner"]> {
  const before = await countBlockers(page);

  let clicked = false;
  for (const role of ["button", "link"] as const) {
    if (clicked) break;
    const candidates = page.getByRole(role, { name: ACCEPT_TEXT });
    const count = await candidates.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 4); i++) {
      const el = candidates.nth(i);
      try {
        if (!(await el.isVisible({ timeout: 500 }))) continue;
        await el.click({ timeout: 2000, noWaitAfter: true });
        await page.waitForTimeout(500);
        clicked = true;
        break;
      } catch {
        // Not clickable (covered, detached, inside a closed shadow root) — try the next.
      }
    }
  }

  const after = await countBlockers(page);
  if (after === 0) return clicked && before > 0 ? "clicked" : "none";

  const hidden = await page
    .evaluate<{ count: number; hide: number }>(hideBlockers(CONSENT_CONTAINERS))
    .catch(() => ({ count: 0, hide: 0 }));
  if (hidden.hide > 0) {
    // Consent libraries lock scrolling on the document as well as covering it.
    await page
      .evaluate(() => {
        document.documentElement.style.removeProperty("overflow");
        document.body.style.removeProperty("overflow");
      })
      .catch(() => {});
    await page.waitForTimeout(200);
    return "hidden";
  }
  return clicked ? "clicked" : "none";
}

/**
 * Where on the page to point the camera.
 *
 * The brief's `mustShow` is written for a human ("the hero section", "the pricing
 * table"), so it is matched by keyword rather than parsed. Anything unrecognised gets
 * the top of the page, which is what "above the fold" means and is the right default:
 * it is the part of a site that is designed to be looked at.
 */
const TARGET_HINTS: Array<{ test: RegExp; selectors: string[] }> = [
  { test: /\b(hero|headline|banner|landing|beranda|halaman utama)\b/i, selectors: ["main section:first-of-type", "header + section", "main > :first-child", "header"] },
  { test: /\b(pricing|harga|paket|plan)\b/i, selectors: ["#pricing", "[id*='pricing' i]", "[class*='pricing' i]"] },
  { test: /\b(docs?|documentation|dokumentasi|guide|readme)\b/i, selectors: ["main article", "article", "main"] },
  { test: /\b(feature|fitur)\b/i, selectors: ["#features", "[id*='feature' i]", "[class*='feature' i]"] },
  { test: /\b(dashboard|console|panel)\b/i, selectors: ["main", "[role='main']"] },
];

async function resolveTarget(page: Page, instruction: string | undefined): Promise<{ y: number; label: string }> {
  const hint = TARGET_HINTS.find((h) => h.test.test(instruction ?? ""));
  if (!hint) return { y: 0, label: "above-the-fold" };

  for (const selector of hint.selectors) {
    const box = await page
      .locator(selector)
      .first()
      .boundingBox({ timeout: 1500 })
      .catch(() => null);
    // A match that is a sliver or is off-screen furniture is worse than the default.
    if (box && box.height >= 200) {
      return { y: Math.max(0, Math.round(box.y)), label: selector };
    }
  }
  return { y: 0, label: "above-the-fold" };
}

/** Launch a Chromium that may reach the internet. Callers own closing it. */
export async function launchEvidenceBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
}

/**
 * Capture one page. Throws on anything that makes the shot meaningless (bad status,
 * navigation failure) — the caller treats a throw exactly like a failed validation.
 *
 * `browser` is passed in so one launch can serve a whole plan, and so the validator can
 * decode the resulting bytes in the same instance.
 */
export async function captureWebEvidence(
  browser: Browser,
  url: string,
  instruction?: string,
  opts: { cropRatio?: string } = {}
): Promise<WebEvidenceShot> {
  const ratio = parseCropRatio(opts.cropRatio);
  const width = BASE_WIDTH;
  const height = Math.round(width / ratio);

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "en-US",
    // Default headless UA advertises HeadlessChrome, which a fair number of sites answer
    // with a consent wall or a 403 — the capture then "succeeds" onto a blocking page.
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (!response) throw new Error(`no response from ${url}`);
    if (status >= 400) throw new Error(`HTTP ${status} from ${url}`);

    // Best-effort quiet: a page that keeps a socket open forever must not block the shot.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});

    const cookieBanner = await dismissCookieBanner(page);
    const target = await resolveTarget(page, instruction);

    if (target.y > 0) {
      await page.evaluate((y: number) => window.scrollTo(0, y), target.y).catch(() => {});
    }
    // Lazy-loaded imagery below the fold needs a frame or two after any scroll.
    await page.waitForTimeout(SETTLE_MS);

    const pageHeight = await page
      .evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))
      .catch(() => height);
    const clipY = Math.min(target.y, Math.max(0, pageHeight - height));

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 90,
      clip: { x: 0, y: clipY, width, height },
    });

    return {
      buffer,
      meta: {
        url,
        finalUrl: page.url(),
        status,
        cookieBanner,
        target: target.label,
        width,
        height,
      },
    };
  } finally {
    await context.close().catch(() => {});
  }
}
