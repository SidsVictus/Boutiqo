import * as React from "react";
import Link from "next/link";

/** Primary action control. Plum solid is the default; signal red (accent) is reserved
 * for the single most important action on a screen. Ported from design-system-source/components/core/Button.jsx. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "secondary" | "quiet" | "ghost" | "danger" | "whatsapp";
  size?: "sm" | "md" | "lg";
  /** Stretch to container width — the default on mobile sheets. */
  block?: boolean;
  /** Fully rounded. Use for filter/segmented actions, not form submits. */
  pill?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  as?: "button" | "a";
  href?: string;
}

const VARIANT_CLASS: Record<string, string> = {
  primary: "bq-btn--primary",
  accent: "bq-btn--accent",
  secondary: "bq-btn--secondary",
  quiet: "bq-btn--quiet",
  ghost: "bq-btn--ghost",
  danger: "bq-btn--danger",
  whatsapp: "bq-btn--whatsapp",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  pill = false,
  iconLeft,
  iconRight,
  as = "button",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    "bq-btn",
    VARIANT_CLASS[variant] || VARIANT_CLASS.primary,
    size === "sm" ? "bq-btn--sm" : size === "lg" ? "bq-btn--lg" : "",
    block ? "bq-btn--block" : "",
    pill ? "bq-btn--pill" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {iconLeft}
      {children ? <span>{children}</span> : null}
      {iconRight}
    </>
  );

  // Internal navigation must go through next/link for client-side routing —
  // a bare <a href> triggers a full page reload, which would wipe Phase 2's
  // in-memory mock session/state on every navigation.
  if (as === "a" && rest.href) {
    const { href, ...anchorRest } = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <Link href={href!} className={cls} {...(anchorRest as Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">)}>
        {content}
      </Link>
    );
  }

  const Tag = as as React.ElementType;
  return (
    <Tag className={cls} {...rest}>
      {content}
    </Tag>
  );
}
