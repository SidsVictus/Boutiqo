"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { listOrders, markOrderPaid } from "@/lib/data/orders";
import Link from "next/link";
import { listCustomers } from "@/lib/data/customers";
import { Button } from "@/components/ds/Button";
import { balance } from "@/lib/calc/order";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import { outstandingTotal } from "@/lib/calc/dues";
import { ChevronRight } from "@/components/app/icons";
import { useToast } from "@/lib/session/ToastContext";
import type { Order, Customer } from "@/lib/supabase/types";

export default function OwnerBillingPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const { flash } = useToast();
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [payingId, setPayingId] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<Record<string, Customer>>({});

  const load = React.useCallback(async () => {
    if (!boutique) return;
    const [rows, customerRows] = await Promise.all([listOrders(boutique.id), listCustomers(boutique.id)]);
    setOrders(rows.filter((o) => !o.paid).sort((a, b) => a.due_date.localeCompare(b.due_date)));
    setCustomers(Object.fromEntries(customerRows.map((c) => [c.id, c])));
  }, [boutique]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `load` is an async data-layer fetch, not a synchronous setState call.
    void load();
  }, [load]);

  if (!boutique) return null;

  async function handleMarkPaid(order: Order) {
    setPayingId(order.id);
    try {
      const updated = await markOrderPaid(order.id);
      flash(`Order ${updated.order_code} marked paid.`, "success");
      load();
    } catch {
      flash("Couldn't mark the order paid. Try again.", "danger");
    } finally {
      setPayingId(null);
    }
  }

  if (orders === null) return <div className="bq-skeleton" style={{ height: 160 }} />;

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
      <div className="bq-card" style={{ background: "var(--surface-sunken)", marginBottom: 6 }}>
        <span className="bq-label">Total outstanding</span>
        <div className="bq-num" style={{ fontSize: 25, fontWeight: 700 }}>
          {formatMoney(outstandingTotal(orders))}
        </div>
        <span className="bq-field__hint">
          {orders.length} unpaid order{orders.length === 1 ? "" : "s"} · tap one to open it
        </span>
      </div>
      {orders.map((o) => (
        <div key={o.id} className="bq-row-split">
          <Link href={`/owner/orders/${o.id}`} className="bq-order-row">
            <div className="bq-order-row__main">
              <span className="bq-order-row__title">{customers[o.customer_id]?.name ?? "Customer"} · {o.order_code}</span>
              <span className="bq-order-row__meta">
                Due {formatShortDate(o.due_date)} · Balance {formatMoney(balance(o.total_amount, o.advance_amount))}
              </span>
            </div>
            <ChevronRight size={18} />
          </Link>
          <Button size="sm" variant="accent" disabled={payingId === o.id} onClick={() => void handleMarkPaid(o)}>
            {payingId === o.id ? "Saving…" : "Mark paid"}
          </Button>
        </div>
      ))}
    </div>
  );
}
