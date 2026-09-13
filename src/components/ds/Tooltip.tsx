import * as React from "react";

export interface TooltipProps {
  content?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, side = "top", children, className = "" }: TooltipProps) {
  const [show, setShow] = React.useState(false);
  return (
    <span
      className={["bq-tooltip", className].filter(Boolean).join(" ")}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && content ? (
        <span className={`bq-tooltip__bubble bq-tooltip__bubble--${side}`} role="tooltip">
          {content}
        </span>
      ) : null}
    </span>
  );
}
