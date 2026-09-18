import * as React from "react";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  selectable?: boolean;
  selected?: boolean;
  onRemove?: (e: React.MouseEvent) => void;
}

export function Tag({ selectable = false, selected = false, onRemove, className = "", children, ...rest }: TagProps) {
  const cls = ["bq-tag", selectable ? "bq-tag--selectable" : "", selected ? "bq-tag--selected" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined} {...rest}>
      {children}
      {onRemove ? (
        <button
          className="bq-tag__x"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
