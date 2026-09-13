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
