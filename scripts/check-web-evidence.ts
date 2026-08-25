/**
 * Live check for the automated screenshot evidence path.
 *
 * The unit suite proves the decisions; this proves the mechanics against real pixels —
 * a real site over the network, a consent banner that has to be dismissed, a blank page
 * and a 404 that have to be rejected. None of it can run in vitest: it needs Chromium,
 * an open socket and a local fixture server.
 *
 *   npm run check:evidence
 *   npm run check:evidence -- https://some.site   (extra live target)
 *
 * Writes every shot it takes to scratch/evidence-shots/ so the accepted and the rejected
 * ones can be looked at side by side.
 */
import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchEvidenceBrowser, captureWebEvidence } from "../src/lib/evidence/capture-web.js";
import { validateEvidenceShot } from "../src/lib/evidence/validate.js";
import { fulfillWebEvidence } from "../src/lib/evidence/fulfill.js";
import { normalizeUploadedEvidence } from "../src/lib/evidence/normalize.js";
import { proposeOfficialUrls } from "../src/lib/evidence/resolve-url.js";
import { verifyPageIdentity } from "../src/lib/evidence/verify-identity.js";
import { captureQueue } from "../src/services/capture-queue.js";
import type { SlidePlan } from "../src/lib/ds/schema.js";

const OUT = process.env.EVIDENCE_OUT ?? resolve(process.cwd(), "scratch/evidence-shots");

const CONTENT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title>
<style>
 body{margin:0;font-family:system-ui;background:#0f172a;color:#e2e8f0}
 header{padding:48px;background:linear-gradient(120deg,#1d4ed8,#7c3aed)}
 h1{font-size:56px;margin:0 0 16px}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:48px}
 .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:24px}
 .card b{color:#38bdf8;font-size:32px}
 footer{padding:40px;background:#020617;color:#94a3b8}
</style></head><body>
<header><h1>Fixture Product</h1><p>Deploy in seconds. Sleep at night.</p></header>
<div class="grid">
  <div class="card"><b>12ms</b><p>p95 latency across every region we run in.</p></div>
  <div class="card"><b>99.99%</b><p>Uptime measured from outside our own network.</p></div>
  <div class="card"><b>0 config</b><p>Ship without writing a pipeline by hand.</p></div>
  <div class="card"><b>Postgres</b><p>Managed, backed up, point-in-time restore.</p></div>
  <div class="card"><b>Edge</b><p>Cached close to whoever asked for it.</p></div>
  <div class="card"><b>Audit</b><p>Every deploy attributable to a person.</p></div>
</div>
<footer>© Fixture Inc. — this page exists only for the evidence check.</footer>
</body></html>`;

const wall = (id: string, working: boolean) => `
  <div id="${id}" style="position:fixed;inset:0;background:#111827;z-index:99;display:flex;
      align-items:center;justify-content:center;flex-direction:column;gap:24px;color:#fff;font-size:28px">
     <p>We use cookies. A lot of them.</p>
     <button style="font-size:24px;padding:16px 32px"${working ? ` onclick="document.getElementById('${id}').remove()"` : ""}>Accept all</button>
   </div>`;

/** A consent wall whose Accept button works — the ordinary case. */
const COOKIE_PAGE = CONTENT_PAGE.replace("</body>", `${wall("onetrust-consent-sdk", true)}</body>`);

/**
 * A consent wall whose Accept button does nothing, which is what a dialog inside a closed
 * shadow root or a cross-origin iframe looks like from out here. Clicking "succeeds" and
 * the wall stays; the capture has to notice and hide it.
 */
const STUBBORN_COOKIE_PAGE = CONTENT_PAGE.replace(
  "</body>",
  `${wall("cookie-consent-stubborn", false)}</body>`
);

const BLANK_PAGE = `<!doctype html><html><head><title>Blank</title></head>
<body style="margin:0;background:#fff"></body></html>`;

function fixtures(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/content")) return send(res, 200, CONTENT_PAGE);
    if (url.startsWith("/cookie-stubborn")) return send(res, 200, STUBBORN_COOKIE_PAGE);
    if (url.startsWith("/cookie")) return send(res, 200, COOKIE_PAGE);
    if (url.startsWith("/blank")) return send(res, 200, BLANK_PAGE);
    if (url.startsWith("/gone")) return send(res, 404, "<h1>404 Not Found</h1>");
    return send(res, 404, "nope");
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      ok({ server, base: `http://127.0.0.1:${port}` });
    })
  );
}

function send(res: any, status: number, body: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

/**
 * A PNG data URL of the requested size, drawn in the browser — so the upload cases run on
 * real bytes without checking fixture images into the repo.
 */
async function makeImage(browser: any, w: number, h: number, kind: "wide" | "tall" | "blank"): Promise<string> {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.setContent("<body></body>");
    return await page.evaluate(`(() => {
      const c = document.createElement("canvas");
      c.width = ${w}; c.height = ${h};
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, ${w}, ${h});
      if ("${kind}" !== "blank") {
        const colors = ["#1d4ed8", "#7c3aed", "#0f172a", "#38bdf8", "#f97316", "#14b8a6"];
        for (let i = 0; i < 60; i++) {
          x.fillStyle = colors[i % colors.length];
          x.fillRect((i * 97) % ${w}, (i * 137) % ${h}, 180, 90);
        }
        x.fillStyle = "#111827"; x.font = "bold 64px system-ui";
        x.fillText("EVIDENCE", 40, 120);
      }
      return c.toDataURL("image/png");
    })()`);
  } finally {
    await ctx.close();
  }
}

interface Row {
  name: string;
  expected: "accept" | "reject";
  got: string;
  detail: string;
  file?: string;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { server, base } = await fixtures();
  const browser = await launchEvidenceBrowser();
  const rows: Row[] = [];

  const run = async (name: string, url: string, expected: "accept" | "reject", instruction?: string) => {
    try {
      const shot = await captureWebEvidence(browser, url, instruction, { cropRatio: "4:5" });
      const verdict = await validateEvidenceShot(browser, shot.buffer);
      const file = resolve(OUT, `${name}.jpg`);
      writeFileSync(file, shot.buffer);
      rows.push({
        name,
        expected,
        got: verdict.ok ? "accept" : `reject:${verdict.reason}`,
        detail:
          `banner=${shot.meta.cookieBanner} target=${shot.meta.target} ` +
          `${shot.meta.width}x${shot.meta.height} ${(shot.buffer.byteLength / 1024).toFixed(0)}KB ` +
          `white=${verdict.metrics.nearWhitePct.toFixed(2)} dom=${verdict.metrics.dominantPct.toFixed(2)} ` +
          `buckets=${verdict.metrics.distinctBuckets}`,
        file,
      });
    } catch (err) {
      rows.push({
        name,
        expected,
        got: "reject:error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 1. A real site over the network, captured for a "hero section" brief.
  await run("live-opencode", "https://opencode.ai", "accept", "hero section");
  for (const extra of process.argv.slice(2)) {
    await run(`live-${new URL(extra).hostname}`, extra, "accept", "hero section");
  }

  // 2. Fixtures: content, consent wall, blank page, 404.
  await run("fixture-content", `${base}/content`, "accept", "hero section");
  await run("fixture-cookie-wall", `${base}/cookie`, "accept", "hero section");
  await run("fixture-cookie-stubborn", `${base}/cookie-stubborn`, "accept", "hero section");
  await run("fixture-blank", `${base}/blank`, "reject");
  await run("fixture-404", `${base}/gone`, "reject");

  // 3. Resolution and the identity gate, live.
  //
  //    There is no web search behind the candidate any more, so the gate below is what
  //    stands between a remembered domain and a photograph of the wrong company.
  for (const entity of ["OpenCode, the open source AI coding agent CLI", "Zorblax quantum framework"]) {
    const proposal = await proposeOfficialUrls(entity);
    if (!proposal.ok) {
      rows.push({
        name: `resolve-${entity.split(",")[0].split(" ")[0].toLowerCase()}`,
        expected: entity.startsWith("OpenCode") ? "accept" : "reject",
        got: `reject:${proposal.reason}`,
        detail: `no candidate (${proposal.candidate ?? "-"})`,
      });
      continue;
    }
    const first = proposal.candidates[0];
    const identity = await verifyPageIdentity(browser, first.url, entity);
    rows.push({
      name: `resolve-${entity.split(",")[0].split(" ")[0].toLowerCase()}`,
      expected: entity.startsWith("OpenCode") ? "accept" : "reject",
      got: identity.ok ? "accept" : `reject:${identity.method}`,
      detail:
        `candidates=[${proposal.candidates.map((c) => c.host).join(", ")}] ` +
        `verified=${first.host} score=${identity.score.toFixed(2)} ` +
        `title=${JSON.stringify((identity.signals?.title ?? "").slice(0, 48))}`,
    });
  }

  //    Deliberately wrong: a real, reachable, https site that has nothing to do with the
  //    entity. Nothing upstream can catch this — the gate has to.
  const forced = await verifyPageIdentity(browser, "https://example.com", "OpenCode, the open source AI coding agent CLI");
  rows.push({
    name: "forced-wrong-domain",
    expected: "reject",
    got: forced.ok ? "accept" : `reject:${forced.method}`,
    detail: `score=${forced.score.toFixed(2)} title=${JSON.stringify(forced.signals?.title ?? "")} — ${forced.reason ?? ""}`,
  });

  const forcedBig = await verifyPageIdentity(browser, "https://vercel.com", "OpenCode, the open source AI coding agent CLI");
  rows.push({
    name: "forced-wrong-real-site",
    expected: "reject",
    got: forcedBig.ok ? "accept" : `reject:${forcedBig.method}`,
    detail: `score=${forcedBig.score.toFixed(2)} title=${JSON.stringify((forcedBig.signals?.title ?? "").slice(0, 48))}`,
  });

  // 4. A deck with no screenshot slide must not touch any of this.
  let launched = 0;
  const plain = {
    title: "t",
    caption: "c",
    hashtags: ["a", "b", "c", "d", "e"],
    slides: [
      { role: "cover", eyebrow: "E", headline: "H" },
      { role: "point", counter: "02 / 03", eyebrow: "E", headline: "H", body: "b", mockup: { type: "checklist", items: ["a", "b"] } },
      { role: "outro", eyebrow: "E", headline: "H" },
    ],
  } as SlidePlan;
  const untouched = await fulfillWebEvidence(plain, {
    path: "user",
    propose: async () => {
      throw new Error("resolution must not run for a deck with no screenshot slide");
    },
    browserFactory: async () => {
      launched++;
      return browser;
    },
  });
  rows.push({
    name: "no-screenshot-deck",
    expected: "accept",
    got: untouched.plan === plain && launched === 0 ? "accept" : "reject:touched",
    detail: `browsers launched=${launched}, attempts=${untouched.attempts.length}`,
  });

  // 5. The human upload path: whatever a person's screenshot tool produced, shaped into
  //    the same 4:5 the automatic path produces.
  const wide = await makeImage(browser, 1920, 1080, "wide");
  const shaped = await normalizeUploadedEvidence(wide, "4:5");
  writeFileSync(resolve(OUT, "upload-1920x1080-to-4x5.jpg"), Buffer.from(shaped.dataUrl.split(",")[1], "base64"));
  rows.push({
    name: "upload-wide-desktop",
    expected: "accept",
    got: Math.abs(shaped.width / shaped.height - 0.8) < 0.01 ? "accept" : `reject:ratio ${shaped.width}x${shaped.height}`,
    detail: `${shaped.width}x${shaped.height} ${(shaped.bytes / 1024).toFixed(0)}KB warning=${shaped.warning ?? "none"}`,
  });

  const tall = await makeImage(browser, 800, 2400, "tall");
  const shapedTall = await normalizeUploadedEvidence(tall, "4:5");
  rows.push({
    name: "upload-tall-page-grab",
    expected: "accept",
    got: Math.abs(shapedTall.width / shapedTall.height - 0.8) < 0.01 ? "accept" : `reject:ratio`,
    detail: `${shapedTall.width}x${shapedTall.height} warning=${shapedTall.warning ?? "none"}`,
  });

  // A blank upload is warned about, never refused — a person chose this file.
  const blank = await makeImage(browser, 1200, 900, "blank");
  const shapedBlank = await normalizeUploadedEvidence(blank, "4:5");
  rows.push({
    name: "upload-blank-warns",
    expected: "accept",
    got: shapedBlank.warning === "mostly-blank" ? "accept" : `reject:no-warning`,
    detail: `warning=${shapedBlank.warning ?? "none"} white=${shapedBlank.metrics.nearWhitePct.toFixed(2)}`,
  });

  await captureQueue.shutdown();
  await browser.close();
  server.close();

  let failures = 0;
  for (const r of rows) {
    const ok = r.expected === "accept" ? r.got === "accept" : r.got.startsWith("reject");
    if (!ok) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(22)} want=${r.expected.padEnd(6)} got=${r.got.padEnd(22)} ${r.detail}`
    );
  }
  console.log(`\nShots written to ${OUT}`);
  if (failures) {
    console.error(`${failures} case(s) did not behave as expected.`);
    process.exit(1);
  }
}

main();
