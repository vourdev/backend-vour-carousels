import { describe, it, expect } from "vitest";
import { nextWibSlot, POST_HOUR_WIB } from "@/lib/publish/schedule";

/**
 * The bug this covers: the slot used to be built with the local-time Date
 * constructor, so in a UTC container "12:00" meant 12:00Z — 19:00 in Jakarta.
 * Midday WIB is 05:00Z, and that has to hold no matter what TZ the process runs in.
 */
describe("nextWibSlot", () => {
  it("puts midday WIB at 05:00 UTC, not 12:00 UTC", () => {
    // 00:00 WIB on 20 Aug = 17:00Z on 19 Aug, i.e. when the cron fires.
    const cronFire = new Date("2026-08-19T17:00:00.000Z");
    expect(nextWibSlot(cronFire, POST_HOUR_WIB).toISOString()).toBe("2026-08-20T05:00:00.000Z");
  });

  it("uses the WIB calendar day, not the UTC one, across the date boundary", () => {
    // 18:00Z on 19 Aug is already 01:00 WIB on 20 Aug. The slot must be
    // midday on the 20th WIB — reading the UTC date here would pick the 19th.
    const pastWibMidnight = new Date("2026-08-19T18:00:00.000Z");
    expect(nextWibSlot(pastWibMidnight, POST_HOUR_WIB).toISOString()).toBe("2026-08-20T05:00:00.000Z");
  });

  it("rolls to tomorrow when today's slot has already passed", () => {
    // 14:00 WIB = 07:00Z — past midday, so the next midday is tomorrow.
    const afterMidday = new Date("2026-08-19T07:00:00.000Z");
    expect(nextWibSlot(afterMidday, POST_HOUR_WIB).toISOString()).toBe("2026-08-20T05:00:00.000Z");
  });

  it("keeps today's slot when the run is still before midday WIB", () => {
    // 09:00 WIB = 02:00Z — midday today is still ahead.
    const morning = new Date("2026-08-19T02:00:00.000Z");
    expect(nextWibSlot(morning, POST_HOUR_WIB).toISOString()).toBe("2026-08-19T05:00:00.000Z");
  });

  it("does not depend on the host timezone", () => {
    const now = new Date("2026-08-19T02:00:00.000Z");
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const inNy = nextWibSlot(now, POST_HOUR_WIB).toISOString();
      process.env.TZ = "UTC";
      const inUtc = nextWibSlot(now, POST_HOUR_WIB).toISOString();
      expect(inNy).toBe(inUtc);
    } finally {
      process.env.TZ = original;
    }
  });

  it("honours the minute argument for the staggered second slot", () => {
    const morning = new Date("2026-08-19T02:00:00.000Z");
    expect(nextWibSlot(morning, POST_HOUR_WIB, 30).toISOString()).toBe("2026-08-19T05:30:00.000Z");
  });
});
