import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCarousel,
  updateCarousel,
  listCarousels,
  getCarousel,
  deleteCarousel,
  getUnderusedMockupTypes,
} from "@/lib/history/repo";
import { samplePlan } from "@/lib/ds/sample";

// The repo builds its libsql client lazily on the first query, so pointing
// DATABASE_URL at a throwaway file here (rather than the repo-root
// local-auth.db every worker shares) is enough to isolate this suite.
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "carousel-repo-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  delete process.env.DATABASE_AUTH_TOKEN;
});

describe("carousel history repo", () => {
  it("creates, lists, gets, and updates a carousel", async () => {
    const user = `u-${crypto.randomUUID()}`;

    const c = await createCarousel({
      userId: user,
      source: "ai",
      title: "Idempotency",
      caption: "cap",
      hashtags: ["backend", "api"],
      slideCount: 3,
      model: "vour-combos",
      status: "exported",
      thumbnail: "https://res.cloudinary.com/x/thumb.jpg",
    });

    expect(c.id).toBeTruthy();
    expect(c.hashtags).toEqual(["backend", "api"]);
    expect(c.status).toBe("exported");

    const fetched = await getCarousel(c.id, user);
    expect(fetched?.title).toBe("Idempotency");

    await updateCarousel(c.id, { status: "scheduled", bufferIgId: "ig-123" });
    const updated = await getCarousel(c.id, user);
    expect(updated?.status).toBe("scheduled");
    expect(updated?.bufferIgId).toBe("ig-123");

    const list = await listCarousels(user);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(c.id);

    await deleteCarousel(c.id, user);
    expect(await getCarousel(c.id, user)).toBeNull();
  });

  // The automation writes every field on the way in, and the INSERT column list
  // and its placeholder list have to agree exactly — a spare "?" is a statement
  // SQLite rejects outright ("15 values for 14 columns"), so a mismatch is not a
  // bad row, it is every generation dying before a single carousel is saved.
  it("round-trips every column the automation writes, slide plan included", async () => {
    const user = `u-${crypto.randomUUID()}`;

    const c = await createCarousel({
      userId: user,
      source: "ai",
      title: "Full row",
      caption: "hook\n\n- one\n\nCTA",
      hashtags: ["fyp", "backend", "api", "idempotency", "vourdev"],
      slideCount: samplePlan.slides.length,
      model: "vour-combos",
      status: "scheduled",
      thumbnail: "https://res.cloudinary.com/x/1.jpg",
      imageUrls: ["https://res.cloudinary.com/x/1.jpg", "https://res.cloudinary.com/x/2.jpg"],
      slidePlan: samplePlan,
    });

    const fetched = await getCarousel(c.id, user);
    expect(fetched?.imageUrls).toHaveLength(2);
    expect(fetched?.slidePlan?.title).toBe(samplePlan.title);
    expect(fetched?.slidePlan?.slides).toHaveLength(samplePlan.slides.length);
    expect(fetched?.model).toBe("vour-combos");
    expect(fetched?.slideCount).toBe(samplePlan.slides.length);
  });

  it("ranks mockup types the user has not used recently first", async () => {
    const user = `u-${crypto.randomUUID()}`;
    await createCarousel({
      userId: user,
      source: "ai",
      title: "Stats",
      slidePlan: samplePlan,
    });

    const underused = await getUnderusedMockupTypes(user);
    expect(underused).toHaveLength(8);
    const used = new Set(
      samplePlan.slides.flatMap((s) => (s.role === "point" && s.mockup ? [s.mockup.type] : []))
    );
    for (const type of underused) expect(used.has(type)).toBe(false);
  });

  // These three sit at the bottom of any frequency ranking forever: screenshot needs a
  // human to upload the image, custom and browser are capped at ~1 per deck by the
  // prompt. Recommending them every run is how the cron ends up shipping a
  // "BUTUH SCREENSHOT ASLI" placeholder to Instagram.
  it("never recommends the types that are rare on purpose", async () => {
    const user = `u-${crypto.randomUUID()}`;
    await createCarousel({ userId: user, source: "ai", title: "Stats", slidePlan: samplePlan });

    const underused = await getUnderusedMockupTypes(user);
    for (const type of ["screenshot", "custom", "browser"]) {
      expect(underused).not.toContain(type);
    }
  });

  // Every carousel written before the INSERT fix stored a NULL slide_plan, so the stats
  // came back empty, every type tied at zero, and the "least used" ranking degenerated to
  // ALL_MOCKUP_TYPES in array order — whose first entries are the MOST used types in the
  // deck. The prompt then presented those as "underused, prioritize these".
  it("recommends nothing when no carousel has a stored slide plan", async () => {
    const user = `u-${crypto.randomUUID()}`;
    await createCarousel({ userId: user, source: "ai", title: "No plan stored" });

    expect(await getUnderusedMockupTypes(user)).toEqual([]);
  });
});
