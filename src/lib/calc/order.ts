export type Stage = "received" | "cutting" | "stitching" | "ready" | "delivered";
export type EffectiveStage = Stage | "overdue";

export const STAGE_ORDER: Stage[] = ["received", "cutting", "stitching", "ready", "delivered"];

/** total - advance. Never negative by construction (advance <= total is enforced at input). */
export function balance(total: number, advance: number): number {
  return Math.max(0, total - advance);
}

/**
 * Overdue is derived, never stored (docs/decisions.md #1). True when the stage
 * isn't yet ready/delivered and the due date has passed.
 */
export function isOverdue(stage: Stage, dueDate: string | Date, today: Date = new Date()): boolean {
  if (stage === "ready" || stage === "delivered") return false;
  const due = typeof dueDate === "string" ? new Date(dueDate + "T00:00:00") : dueDate;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due.getTime() < todayStart.getTime();
}

/** The stage a stage-progress UI should treat an order as being at — overdue
 * orders are shown at "cutting" for progress purposes, per the handoff. */
export function effectiveStage(stage: Stage, dueDate: string | Date, today?: Date): EffectiveStage {
  return isOverdue(stage, dueDate, today) ? "overdue" : stage;
}

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function isStageBefore(a: Stage, b: Stage): boolean {
  return stageIndex(a) < stageIndex(b);
}

export function isStageAfter(a: Stage, b: Stage): boolean {
  return stageIndex(a) > stageIndex(b);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}
