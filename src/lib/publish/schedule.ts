/** WIB is a fixed UTC+7 with no daylight saving, so a constant offset is exact. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Posts go out at midday Jakarta time. */
export const POST_HOUR_WIB = 12;

/**
 * The next occurrence of `hour` Jakarta time, as a UTC instant.
 *
 * The obvious version — `new Date(y, m, d, 12, 0)` — builds noon in whatever
 * zone the process happens to be in. In the container that is UTC, so "12:00"
 * was scheduling 12:00Z, which is 19:00 in Jakarta: posts landed at seven in
 * the evening instead of midday. Do the arithmetic in WIB explicitly and
 * convert back, so the result does not depend on the container's clock.
 */
export function nextWibSlot(now: Date, hour: number = POST_HOUR_WIB, minute = 0): Date {
  const wibNow = new Date(now.getTime() + WIB_OFFSET_MS);
  const slotMs =
    Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate(), hour, minute, 0, 0) -
    WIB_OFFSET_MS;
  // The cron fires at 00:00 WIB so today's slot is normally still ahead; a
  // manual or retried run after midday rolls to tomorrow rather than scheduling
  // a time Buffer would reject as being in the past.
  return new Date(slotMs <= now.getTime() ? slotMs + 24 * 60 * 60 * 1000 : slotMs);
}
