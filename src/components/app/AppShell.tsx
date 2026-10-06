"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, LogOut, Plus } from "./icons";
import { Button } from "@/components/ds/Button";
import { Logo } from "./Logo";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  matchPrefix?: string;
}

export interface AppShellProps {
  role: "owner" | "admin";
  navItems: NavItem[];
  currentPath: string;
  accountName: string;
  accountSub?: string;
  title: string;
  subtitle?: string;
  /** Web top-bar accent action (e.g. "New order" / "Add boutique"). */
  headerAction?: React.ReactNode;
  showBack?: boolean;
  signOutHref: string;
  /** Mobile-only extra tab item ("+", signal red) — owner app only. */
  mobileNewHref?: string;
  children: React.ReactNode;
}

function isActive(item: NavItem, path: string) {
  const prefix = item.matchPrefix ?? item.href;
  return path === item.href || path.startsWith(prefix + "/");
}

export function AppShell({
  role,
  navItems,
  currentPath,
  accountName,
  accountSub,
  title,
  subtitle,
  headerAction,
  showBack = false,
  signOutHref,
  mobileNewHref,
  children,
}: AppShellProps) {
  const router = useRouter();

  return (
    <div className="bq-app-frame">
      {/* ---------- Mobile (below 1024px) ----------
          Tabs sit at the very top (just under the status bar), with the page
          title row beneath. A bottom tab bar floated above Android's own
          navigation bar with a gap under it, and was easy to mistake for it. */}
      <div className="bq-shell-mobile">
        <header className="bq-mobile-top">
          <nav className="bq-tabbar" aria-label="Main">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="bq-tabbar__item" aria-current={isActive(item, currentPath) ? "page" : undefined}>
                  <Icon size={20} />
                  {item.label}
                </Link>
              );
            })}
            {mobileNewHref ? (
              <Link href={mobileNewHref} className="bq-tabbar__item bq-tabbar__item--new" aria-label="New order">
                <span className="bq-tabbar__new-disc">
                  <Plus size={18} />
                </span>
                New
              </Link>
            ) : null}
          </nav>
          <div className="bq-appbar">
            {showBack ? (
              <button className="bq-back-btn" aria-label="Back" onClick={() => router.back()}>
                <ChevronLeft size={20} />
              </button>
            ) : (
              <span style={{ width: 36 }} />
            )}
            <span className="bq-appbar__title">{title}</span>
            <Link href={signOutHref} className="bq-back-btn" aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </Link>
          </div>
        </header>
        <main className="bq-shell-mobile__content">
          {/* The owner's header action (New order) is the + tab on mobile;
              the admin's (Add boutique) has nowhere else to live. */}
          {role === "admin" && headerAction ? <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>{headerAction}</div> : null}
          {children}
        </main>
      </div>

      {/* ---------- Web (at/above 1024px) ---------- */}
      <div className="bq-shell-web">
        <div className="bq-web-body">
          <aside className="bq-sidebar">
            <div className="bq-sidebar__brand">
              <Logo size={28} onDark />
              Boutiqo
            </div>
            <div className="bq-sidebar__nav">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="bq-sidebar__item" aria-current={isActive(item, currentPath) ? "page" : undefined}>
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="bq-sidebar__account">
              <div className="bq-sidebar__account-name">{accountName}</div>
              {accountSub ? <div className="bq-sidebar__account-sub">{accountSub}</div> : null}
              <Link href={signOutHref} className="bq-sidebar__item">
                <LogOut size={18} />
                Sign out
              </Link>
            </div>
          </aside>
          <div className="bq-web-main">
            <header className="bq-topbar">
              <div>
                <div className="bq-topbar__title">{title}</div>
                {subtitle ? <div className="bq-topbar__subtitle">{subtitle}</div> : null}
              </div>
              {headerAction}
            </header>
            <div className="bq-web-content">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NewOrderHeaderButton({ href, disabled, reason }: { href: string; disabled?: boolean; reason?: string }) {
  if (disabled) {
    return (
      <Button variant="accent" disabled title={reason}>
        New order
      </Button>
    );
  }
  return (
    <Button as="a" href={href} variant="accent">
      New order
    </Button>
  );
}
