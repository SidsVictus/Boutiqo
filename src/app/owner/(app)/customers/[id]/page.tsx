"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getCustomer, customerOrders } from "@/lib/data/customers";
import { Card } from "@/components/ds/Card";
import { OrderRow } from "@/components/app/OrderRow";
import { Button } from "@/components/ds/Button";
import { EditCustomerForm } from "@/components/app/EditCustomerForm";
import { Pencil, Phone, Plus } from "@/components/app/icons";
import { whatsappLink, whatsappNumber } from "@/lib/tracking/share";
import type { Customer, Order } from "@/lib/supabase/types";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = React.useState<Customer | null | undefined>(undefined);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    // The customer list's "Edit customer" button lands here with ?edit=1.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount (no useSearchParams, so the page stays statically renderable).
    if (new URLSearchParams(window.location.search).get("edit")) setEditing(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getCustomer(id).then((c) => {
      if (cancelled) return;
      setCustomer(c);
      if (c) customerOrders(c.id).then((rows) => !cancelled && setOrders(rows));
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
      {editing ? (
        <Card title="Edit customer">
          <EditCustomerForm
            customer={customer}
            onSaved={(updated) => {
              setCustomer(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <Card title={customer.name} meta={customer.address || "No address on file"}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 16 }}>
            {customer.phone ? (
              <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Phone size={14} /> {customer.phone}
              </a>
            ) : null}
            {customer.instagram_handle ? (
              <a href={`https://instagram.com/${encodeURIComponent(customer.instagram_handle.replace(/^@/, "").trim())}`} target="_blank" rel="noopener noreferrer">
                {customer.instagram_handle}
              </a>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <Button as="a" href={`/owner/orders/new?customer=${customer.id}`} iconLeft={<Plus size={16} />}>
              New order
            </Button>
            {whatsappNumber(customer.phone) ? (
              <Button as="a" variant="whatsapp" href={whatsappLink(whatsappNumber(customer.phone), `Hello ${customer.name},`)} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </Button>
            ) : null}
            <Button variant="secondary" iconLeft={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Edit customer
            </Button>
          </div>
        </Card>
      )}

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
