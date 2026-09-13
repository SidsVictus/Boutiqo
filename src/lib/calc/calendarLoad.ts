/**
 * Boutiqo's deadline calendar thermal scale (CLAUDE_CODE_HANDOFF.md §8,
 * "changes after first implementation" — this is the FINAL scale, superseding
 * the design system's generic 5-level LoadCell component). Capacity 8/day.
 */
export type LoadBand = "free" | "low" | "busy";

export function loadBand(count: number, capacity = 8): LoadBand {
  const freeCeiling = Math.floor(capacity * 0.375); // 3 of 8
  const lowCeiling = Math.floor(capacity * 0.75); // 6 of 8
  if (count > lowCeiling) return "busy";
  if (count > freeCeiling) return "low";
  return "free";
}

export const LOAD_BAND_LABEL: Record<LoadBand, string> = {
  free: "Free",
  low: "Low work",
  busy: "Too busy",
};

/** Groups a list of orders by due_date into per-day counts, for the deadline
 * calendar. Phase 3: computed client-side from real fetched orders (there is
 * no dedicated "load by date" backend endpoint — the calendar is a view over
 * the same orders the dashboard/calendar screens already fetch). */
export function computeLoadByDate(orders: Array<{ due_date: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of orders) counts[o.due_date] = (counts[o.due_date] ?? 0) + 1;
  return counts;
}
