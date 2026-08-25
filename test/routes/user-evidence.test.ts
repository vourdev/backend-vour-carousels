import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The upload endpoint's guards, which run before any browser work.
 *
 * The pixel half — cropping to the brief's ratio, re-encoding, the blank warning — needs
 * a real Chromium and lives in `npm run check:evidence`, next to the capture cases it
 * mirrors.
 */
let app: { request: (path: string, init?: RequestInit) => Promise<Response> };

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "route-evidence-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
  app = (await import("@/routes/user/evidence")).default as never;
});

const upload = (body: unknown, headers: Record<string, string> = {}) =>
  app.request("/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("POST /api/evidence/upload", () => {
  it("refuses a payload that is not an image data URL", async () => {
    const res = await upload({ dataUrl: "https://example.com/shot.png", cropRatio: "4:5" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unsupported");
  });

  it("refuses an SVG, which is a document rather than a picture", async () => {
    const res = await upload({ dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unsupported");
  });

  it("refuses an oversized upload on the declared length alone", async () => {
    // Rejected before the body is read, so a 40 MB post is never parsed into memory.
    const res = await upload({ dataUrl: "data:image/png;base64,AAA" }, {
      "content-length": String(40 * 1024 * 1024),
    });
    expect(res.status).toBe(413);
  });

  it("refuses a request with no image at all", async () => {
    const res = await upload({ cropRatio: "4:5" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("dataUrl");
  });
});
