"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getOrder } from "@/lib/data/orders";
import { getCustomer } from "@/lib/data/customers";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Check } from "@/components/app/icons";
import { SendTrackingLink } from "@/components/app/SendTrackingLink";
import { useSession } from "@/lib/session/SessionContext";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import type { Order, Customer } from "@/lib/supabase/types";

export default function OrderConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const boutiqueName = session?.kind === "owner" ? session.boutique.name : "";
  const [order, setOrder] = React.useState<Order | null>(null);
  const [customer, setCustomer] = React.useState<Customer | null>(null);

  React.useEffect(() => {
    getOrder(id).then(async (o) => {
      setOrder(o);
      if (o) setCustomer(await getCustomer(o.customer_id));
    });
  }, [id]);

  if (!order || !customer) return <div className="bq-skeleton" style={{ height: 200 }} />;


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ margin: "0 auto 12px", width: 56, height: 56, borderRadius: "999px", background: "var(--success-bg)", color: "var(--green-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={26} />
        </div>
        <h1 className="bq-brand" style={{ fontSize: 24 }}>
          Order {order.order_code} created
        </h1>
      </div>
      <Card title={customer.name} meta={order.garment_type === "Other" ? order.garment_type_other : order.garment_type}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 16 }}>
          <span>Due {formatShortDate(order.due_date)}</span>
          <span>Total {formatMoney(order.total_amount)} · Advance {formatMoney(order.advance_amount)}</span>
          <span style={{ color: order.cloth_photo_file_id ? "var(--text-muted)" : "var(--signal-700)" }}>
            {order.cloth_photo_file_id ? "Cloth photo attached" : "No cloth photo yet — add one from the order record"}
          </span>
        </div>
      </Card>
      <SendTrackingLink order={order} customer={customer} boutiqueName={boutiqueName} onCustomerUpdated={setCustomer} />
      <Button as="a" href={`/owner/orders/${order.id}`} variant="secondary" block>
        View order record
      </Button>
    </div>
  );
}
