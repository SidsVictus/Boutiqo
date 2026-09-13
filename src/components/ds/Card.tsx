import * as React from "react";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "default" | "flat" | "raised" | "blush" | "inverse";
  /** Adds hover lift + pointer. Use for whole-card links such as order rows. */
  interactive?: boolean;
  padding?: "default" | "none";
  title?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}

export function Card({
  variant = "default",
  interactive = false,
  padding = "default",
  title,
  meta,
  action,
  className = "",
  children,
  ...rest
}: CardProps) {
  const cls = [
    "bq-card",
    variant !== "default" ? `bq-card--${variant}` : "",
    interactive ? "bq-card--interactive" : "",
    padding === "none" ? "bq-card--pad-none" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const head =
    title || action || meta ? (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
        <div>
          <h3 className="bq-card__title">{title}</h3>
          {meta ? (
            <div className="bq-card__meta" style={{ marginTop: 2 }}>
              {meta}
            </div>
          ) : null}
        </div>
        {action}
      </div>
    ) : null;
  return (
    <div className={cls} {...rest}>
      {head}
      {children}
    </div>
  );
}
