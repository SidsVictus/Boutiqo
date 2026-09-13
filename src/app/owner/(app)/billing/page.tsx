"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { listOrders, markOrderPaid } from "@/lib/data/orders";
import { getCustomer } from "@/lib/data/customers";
import { Button } from "@/components/ds/Button";
import { balance } from "@/lib/calc/order";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import { useToast } from "@/lib/session/ToastContext";
import type { Order, Customer } from "@/lib/supabase/types";

export default function OwnerBillingPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const { flash } = useToast();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [customers, setCustomers] = React.useState<Record<string, Customer>>({});

  const load = React.useCallback(async () => {
    if (!boutique) return;
    const rows = await listOrders(boutique.id);
    setOrders(rows.filter((o) => !o.paid));
    const map: Record<string, Customer> = {};
    for (const o of rows) {
      if (!map[o.customer_id]) {
        const c = await getCustomer(o.customer_id);
        if (c) map[o.customer_id] = c;
      }
    }
    setCustomers(map);
  }, [boutique]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `load` is an async data-layer fetch, not a synchronous setState call.
    void load();
  }, [load]);

  if (!boutique) return null;

  async function handleMarkPaid(order: Order) {
    const updated = await markOrderPaid(order.id);
    flash(`Order ${updated.order_code} marked paid.`, "success");
    load();
  }

  if (orders.length === 0) {
    return (
      <div className="bq-empty">
        <div className="bq-empty__title">No bills due</div>
        <p>Every order is paid in full.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {orders.map((o) => (
        <div key={o.id} className="bq-order-row">
          <div className="bq-order-row__main">
            <span className="bq-order-row__title">{customers[o.customer_id]?.name ?? "Customer"} · {o.order_code}</span>
            <span className="bq-order-row__meta">
              Due {formatShortDate(o.due_date)} · Balance {formatMoney(balance(o.total_amount, o.advance_amount))}
            </span>
          </div>
          <Button size="sm" variant="accent" onClick={() => handleMarkPaid(o)}>
            Mark paid
          </Button>
        </div>
      ))}
    </div>
  );
}
