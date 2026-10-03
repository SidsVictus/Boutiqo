"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "@/lib/session/SessionContext";
import { listOrders } from "@/lib/data/orders";
import { listCustomers } from "@/lib/data/customers";
import { OrderRow } from "@/components/app/OrderRow";
import { StatTile } from "@/components/app/StatTile";
import { Button } from "@/components/ds/Button";
import type { Customer, Order } from "@/lib/supabase/types";
import { matchesView, outstandingTotal } from "@/lib/calc/dues";
import { formatMoney, localDateKey } from "@/lib/calc/format";

export default function OwnerDashboardPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);

  React.useEffect(() => {
    if (!boutique) return;
    let cancelled = false;
    listOrders(boutique.id).then((rows) => !cancelled && setOrders(rows));
    listCustomers(boutique.id).then((rows) => !cancelled && setCustomers(rows));
    return () => {
      cancelled = true;
    };
  }, [boutique]);

  if (!boutique) return null;

  if (orders === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="bq-skeleton" style={{ height: 96 }} />
        <div className="bq-skeleton" style={{ height: 96 }} />
      </div>
    );
  }

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Customer";

  // Open orders due within the next 7 days, plus anything already overdue.
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const weekEnd = localDateKey(in7);
  const dueSoon = orders
    .filter((o) => o.stage !== "delivered" && o.due_date <= weekEnd)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const openCount = orders.filter((o) => matchesView(o, "open")).length;
  const overdueCount = orders.filter((o) => matchesView(o, "overdue")).length;
  const readyCount = orders.filter((o) => matchesView(o, "ready")).length;
  const unpaidCount = orders.filter((o) => matchesView(o, "unpaid")).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bq-stat-grid">
        <StatTile label="Open orders" value={openCount} hint="See all dues" href="/owner/calendar?view=open" />
        <StatTile label="Overdue" value={overdueCount} tone={overdueCount > 0 ? "alert" : undefined} href="/owner/calendar?view=overdue" />
        <StatTile label="Ready for pickup" value={readyCount} href="/owner/calendar?view=ready" />
        <StatTile label="Outstanding" value={formatMoney(outstandingTotal(orders))} hint={`${unpaidCount} unpaid`} href="/owner/billing" />
        <StatTile label="Customers" value={customers.length} href="/owner/customers" />
      </div>

      <div>
        <div className="bq-section-head">
          <h2>Due this week</h2>
          <Link href="/owner/calendar?view=open">All dues</Link>
        </div>
        {dueSoon.length === 0 ? (
          <div className="bq-empty">
            <div className="bq-empty__title">Nothing due this week</div>
            <p>New orders will show up here as their delivery dates approach.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
              <Button as="a" href="/owner/orders/new">
                New order
              </Button>
              <Button as="a" href="/owner/calendar?view=open" variant="secondary">
                View all dues
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dueSoon.map((o) => (
              <OrderRow key={o.id} order={o} customerName={customerName(o.customer_id)} href={`/owner/orders/${o.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
