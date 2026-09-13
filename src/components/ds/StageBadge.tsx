import * as React from "react";

export type Stage = "received" | "cutting" | "stitching" | "ready" | "delivered" | "overdue";

export const STAGES: Record<Stage, string> = {
  received: "Received",
  cutting: "Cutting",
  stitching: "Stitching",
  ready: "Ready",
  delivered: "Delivered",
  overdue: "Overdue",
};

export interface StageBadgeProps {
  stage?: Stage;
  size?: "md" | "lg";
  dot?: boolean;
  label?: React.ReactNode;
  className?: string;
}

export function StageBadge({ stage = "received", size = "md", dot = true, label, className = "" }: StageBadgeProps) {
  const cls = ["bq-stage", `bq-stage--${stage}`, size === "lg" ? "bq-stage--lg" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      {dot ? <span className="bq-stage__dot" /> : null}
      {label || STAGES[stage] || stage}
    </span>
  );
}
