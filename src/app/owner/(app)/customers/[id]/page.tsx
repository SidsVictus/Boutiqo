"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getCustomer, customerOrders } from "@/lib/data/customers";
import { Card } from "@/components/ds/Card";
import { OrderRow } from "@/components/app/OrderRow";
import { Phone } from "@/components/app/icons";
import type { Customer, Order } from "@/lib/supabase/types";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = React.useState<Customer | null | undefined>(undefined);
  const [orders, setOrders] = React.useState<Order[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    getCustomer(id).then((c) => {
      if (cancelled) return;
      setCustomer(c);
      if (c) setOrders(customerOrders(c.id));
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (customer === undefined) return <div className="bq-skeleton" style={{ height: 120 }} />;
  if (customer === null) {
    return (
      <div className="bq-empty">
        <div className="bq-empty__title">Customer not found</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title={customer.name} meta={customer.address || "No address on file"}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 14 }}>
          {customer.phone ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Phone size={14} /> {customer.phone}
            </span>
          ) : null}
          {customer.instagram_handle ? <span>{customer.instagram_handle}</span> : null}
        </div>
      </Card>

      <div>
        <h2 style={{ marginBottom: 10 }}>Previous orders</h2>
        {orders.length === 0 ? (
          <div className="bq-empty">
            <p>No orders yet for this customer.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} customerName={customer.name} href={`/owner/orders/${o.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
