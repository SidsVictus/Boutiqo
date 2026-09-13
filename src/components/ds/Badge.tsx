import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "outline";
  dot?: boolean;
  count?: boolean;
}

export function Badge({ tone = "neutral", dot = false, count = false, className = "", children, ...rest }: BadgeProps) {
  const cls = ["bq-badge", `bq-badge--${tone}`, count ? "bq-badge--count" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {dot ? <span className="bq-badge__dot" /> : null}
      {children}
    </span>
  );
}
