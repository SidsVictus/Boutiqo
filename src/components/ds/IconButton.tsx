import * as React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ghost" | "solid" | "outline";
  size?: "sm" | "md";
  round?: boolean;
  /** Accessible name — also rendered as the native tooltip. Required. */
  label: string;
}

export function IconButton({ variant = "ghost", size = "md", round = false, label, className = "", children, ...rest }: IconButtonProps) {
  const cls = [
    "bq-iconbtn",
    variant === "solid" ? "bq-iconbtn--solid" : variant === "outline" ? "bq-iconbtn--outline" : "",
    size === "sm" ? "bq-iconbtn--sm" : "",
    round ? "bq-iconbtn--round" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
