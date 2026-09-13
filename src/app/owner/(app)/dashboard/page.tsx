"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { listOrders } from "@/lib/data/orders";
import { listCustomers } from "@/lib/data/customers";
import { OrderRow } from "@/components/app/OrderRow";
import { StatTile } from "@/components/app/StatTile";
import type { Customer, Order } from "@/lib/supabase/types";
import { effectiveStage } from "@/lib/calc/order";
import { formatMoney } from "@/lib/calc/format";

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

  // "Due today / overdue" + "Rest of week" merged into one de-duplicated, sorted
  // list per the handoff's "changes after first implementation" section.
  const inWindow = orders.filter((o) => {
    const due = new Date(o.due_date + "T00:00:00");
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    return due <= in7;
  });
  const sorted = [...inWindow].sort((a, b) => a.due_date.localeCompare(b.due_date));

  const openCount = orders.filter((o) => o.stage !== "delivered").length;
  const overdueCount = orders.filter((o) => effectiveStage(o.stage, o.due_date) === "overdue").length;
  const outstanding = orders.filter((o) => !o.paid).reduce((sum, o) => sum + (o.total_amount - o.advance_amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bq-g3">
        <StatTile label="Open orders" value={openCount} />
        <StatTile label="Overdue" value={overdueCount} />
        <StatTile label="Outstanding" value={formatMoney(outstanding)} />
      </div>

      <div>
        <h2 style={{ marginBottom: 10 }}>Due this week</h2>
        {sorted.length === 0 ? (
          <div className="bq-empty">
            <div className="bq-empty__title">Nothing due this week</div>
            <p>New orders will show up here as their delivery dates approach.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((o) => (
              <OrderRow key={o.id} order={o} customerName={customerName(o.customer_id)} href={`/owner/orders/${o.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
