"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "@/lib/session/SessionContext";
import { listCustomers } from "@/lib/data/customers";
import { Input } from "@/components/ds/Input";
import { Button } from "@/components/ds/Button";
import { Search, User } from "@/components/app/icons";
import type { Customer } from "@/lib/supabase/types";

export default function OwnerCustomersPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const [search, setSearch] = React.useState("");
  const [customers, setCustomers] = React.useState<Customer[] | null>(null);

  React.useEffect(() => {
    if (!boutique) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: shows a fresh skeleton while a new search resolves.
    setCustomers(null);
    listCustomers(boutique.id, search).then((rows) => !cancelled && setCustomers(rows));
    return () => {
      cancelled = true;
    };
  }, [boutique, search]);

  if (!boutique) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="Search by name or phone" iconLeft={<Search size={16} />} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
        </div>
        <Button as="a" href="/owner/customers/new">
          Add customer
        </Button>
      </div>

      {customers === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="bq-skeleton" style={{ height: 56 }} />
          <div className="bq-skeleton" style={{ height: 56 }} />
        </div>
      ) : customers.length === 0 ? (
        <div className="bq-empty">
          <User size={28} />
          <div className="bq-empty__title">No customers found</div>
          <p>{search ? "Try a different name or phone number." : "Add your first customer to get started."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {customers.map((c) => (
            <Link key={c.id} href={`/owner/customers/${c.id}`} className="bq-order-row">
              <div className="bq-order-row__main">
                <span className="bq-order-row__title">{c.name}</span>
                <span className="bq-order-row__meta">{c.phone || "No phone on file"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
