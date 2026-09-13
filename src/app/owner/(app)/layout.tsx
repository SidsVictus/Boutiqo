"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, NewOrderHeaderButton, type NavItem } from "@/components/app/AppShell";
import { useSession } from "@/lib/session/SessionContext";
import { List, User, CalendarDays, Banknote, Settings } from "@/components/app/icons";

const NAV_ITEMS: NavItem[] = [
  { href: "/owner/dashboard", label: "Home", icon: List },
  { href: "/owner/customers", label: "Customers", icon: User },
  { href: "/owner/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/owner/billing", label: "Billing", icon: Banknote },
  { href: "/owner/settings", label: "Settings", icon: Settings },
];

const TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/owner/dashboard": { title: "Home" },
  "/owner/customers": { title: "Customers", subtitle: "Search by name or phone" },
  "/owner/calendar": { title: "Calendar", subtitle: "Deadline load by day" },
  "/owner/billing": { title: "Bills due", subtitle: "Unpaid orders" },
  "/owner/settings": { title: "Settings", subtitle: "Boutique registration details" },
};

function titleFor(path: string): { title: string; subtitle?: string } {
  if (TITLES[path]) return TITLES[path];
  if (path.startsWith("/owner/customers/new")) return { title: "Add customer" };
  if (path.startsWith("/owner/customers/")) return { title: "Customer" };
  if (path.startsWith("/owner/orders/new")) return { title: "New order" };
  if (path.match(/\/owner\/orders\/[^/]+\/confirm/)) return { title: "Order created" };
  if (path.match(/\/owner\/orders\/[^/]+\/stage/)) return { title: "Update stage" };
  if (path.startsWith("/owner/orders/")) return { title: "Order" };
  return { title: "Boutiqo" };
}

export default function OwnerAppLayout({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!session || session.kind !== "owner") {
      router.replace("/owner/login");
    }
  }, [session, router]);

  if (!session || session.kind !== "owner") return null;

  const { boutique } = session;
  const { title, subtitle } = titleFor(pathname);
  const isDashboard = pathname === "/owner/dashboard";
  const showBack = pathname !== "/owner/dashboard" && !NAV_ITEMS.some((n) => n.href === pathname);

  const newOrderDisabled = boutique.status !== "active";
  const newOrderReason =
    boutique.status === "on_hold"
      ? "This boutique is on hold. New orders are paused until it's reactivated."
      : boutique.status === "disabled"
        ? "This boutique is disabled."
        : undefined;

  return (
    <AppShell
      role="owner"
      navItems={NAV_ITEMS}
      currentPath={pathname}
      accountName={boutique.name}
      accountSub={boutique.owner_name}
      title={title}
      subtitle={subtitle}
      showBack={showBack}
      signOutHref="/owner/signout"
      mobileNewHref={newOrderDisabled ? undefined : "/owner/orders/new"}
      headerAction={isDashboard ? <NewOrderHeaderButton href="/owner/orders/new" disabled={newOrderDisabled} reason={newOrderReason} /> : undefined}
    >
      {boutique.status === "on_hold" && isDashboard ? (
        <div className="bq-card" style={{ background: "var(--amber-100)", color: "var(--amber-700)", marginBottom: 16 }}>
          This boutique is on hold. You can still view and update existing orders, but new orders are paused. Contact
          Boutiqo support to reactivate.
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
