import * as React from "react";

export interface DialogProps {
  open?: boolean;
  /** `sheet` slides up from the bottom and shows a grab handle — the phone default. */
  variant?: "modal" | "sheet";
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({ open = true, variant = "modal", title, description, onClose, footer, children, className = "" }: DialogProps) {
  if (!open) return null;
  const sheet = variant === "sheet";
  return (
    <div className={["bq-dialog__scrim", sheet ? "bq-dialog__scrim--sheet" : ""].filter(Boolean).join(" ")} onClick={onClose}>
      <div
        className={["bq-dialog", sheet ? "bq-dialog--sheet" : "", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {sheet ? <div className="bq-dialog__grab" /> : null}
        <div className="bq-dialog__head">
          <div className="bq-dialog__title">{title}</div>
          {onClose ? (
            <button className="bq-iconbtn bq-iconbtn--sm" aria-label="Close" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
        {description ? <div className="bq-dialog__desc">{description}</div> : null}
        {children ? <div className="bq-dialog__body">{children}</div> : null}
        {footer ? <div className="bq-dialog__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
