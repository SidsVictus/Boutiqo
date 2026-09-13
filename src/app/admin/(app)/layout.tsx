"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, type NavItem } from "@/components/app/AppShell";
import { useSession } from "@/lib/session/SessionContext";
import { List, Store, Shield } from "@/components/app/icons";
import { Button } from "@/components/ds/Button";
import { ADMIN_ROLE_SCOPE } from "@/lib/data/admins";

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Home", icon: List },
  { href: "/admin/boutiques", label: "Boutiques", icon: Store },
  { href: "/admin/roles", label: "Admin roles", icon: Shield },
];

const TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/admin/dashboard": { title: "Platform overview" },
  "/admin/boutiques": { title: "Boutiques", subtitle: "Search by name, area or owner" },
  "/admin/roles": { title: "Admin roles", subtitle: "Internal Boutiqo team" },
};

function titleFor(path: string): { title: string; subtitle?: string } {
  if (TITLES[path]) return TITLES[path];
  if (path.startsWith("/admin/boutiques/new")) return { title: "Add boutique" };
  if (path.match(/\/admin\/boutiques\/[^/]+\/access/)) return { title: "Access control" };
  if (path.startsWith("/admin/boutiques/")) return { title: "Boutique" };
  return { title: "Boutiqo admin" };
}

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (session === undefined) return; // initial session check still in flight
    if (!session || session.kind !== "admin") router.replace("/admin/login");
  }, [session, router]);

  if (session === undefined) return <div className="bq-skeleton" style={{ height: "100dvh" }} />;
  if (!session || session.kind !== "admin") return null;

  const { admin } = session;
  const { title, subtitle } = titleFor(pathname);
  const showBack = !NAV_ITEMS.some((n) => n.href === pathname);
  const canAdd = admin.role === "owner_admin" || admin.role === "support_admin";

  return (
    <AppShell
      role="admin"
      navItems={NAV_ITEMS}
      currentPath={pathname}
      accountName={admin.name}
      accountSub={`${admin.role.replace("_", " ")} · ${ADMIN_ROLE_SCOPE[admin.role]}`}
      title={title}
      subtitle={subtitle}
      showBack={showBack}
      signOutHref="/admin/signout"
      headerAction={
        pathname === "/admin/boutiques" ? (
          <Button as="a" href="/admin/boutiques/new" variant="accent" disabled={!canAdd} title={canAdd ? undefined : "Your role cannot add a boutique"}>
            Add boutique
          </Button>
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
