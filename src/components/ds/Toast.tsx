import * as React from "react";

export interface ToastProps {
  tone?: "default" | "success" | "danger";
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function Toast({ tone = "default", icon, actionLabel, onAction, children, className = "" }: ToastProps) {
  return (
    <div className={["bq-toast", tone !== "default" ? `bq-toast--${tone}` : "", className].filter(Boolean).join(" ")} role="status">
      {icon ? icon : <span className="bq-toast__bar" />}
      <span>{children}</span>
      {actionLabel ? (
        <button className="bq-toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
