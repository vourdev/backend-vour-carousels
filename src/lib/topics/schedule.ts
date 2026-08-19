export type PlanMode = "ideas" | "weekly" | "monthly";

export const MODE_COUNTS: Record<Exclude<PlanMode, "ideas">, number> = {
  weekly: 7,
  monthly: 28, // 4 full weeks — keeps one topic/day without month-length edge cases
};

/**
 * Assign one ISO date per topic, one topic per day starting at `start`
 * (time zeroed to local midnight). "ideas" mode gets no dates — those are
 * backlog entries, not calendar entries.
 */
export function scheduleDates(mode: PlanMode, start: Date, count: number): (string | undefined)[] {
  if (mode === "ideas") return Array.from({ length: count }, () => undefined);
  const base = new Date(start);
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d.toISOString();
  });
}
