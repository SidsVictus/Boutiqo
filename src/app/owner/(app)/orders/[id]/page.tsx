"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getOrder, markOrderPaid } from "@/lib/data/orders";
import { getCustomer } from "@/lib/data/customers";
import { Card } from "@/components/ds/Card";
import { StageBadge } from "@/components/ds/StageBadge";
import { Button } from "@/components/ds/Button";
import { ClothPhotoUpload } from "@/components/app/ClothPhotoUpload";
import { MEASUREMENT_LABELS } from "@/components/app/measurementLabels";
import { MEASUREMENT_FIELDS } from "@/lib/supabase/types";
import { balance, effectiveStage } from "@/lib/calc/order";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import { useToast } from "@/lib/session/ToastContext";
import type { Order, Customer } from "@/lib/supabase/types";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { flash } = useToast();
  const [order, setOrder] = React.useState<Order | null | undefined>(undefined);
  const [customer, setCustomer] = React.useState<Customer | null>(null);

  const load = React.useCallback(async () => {
    const o = await getOrder(id);
    setOrder(o);
    if (o) setCustomer(await getCustomer(o.customer_id));
  }, [id]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `load` is an async data-layer fetch, not a synchronous setState call.
    void load();
  }, [load]);

  if (order === undefined) return <div className="bq-skeleton" style={{ height: 240 }} />;
  if (!order || !customer) {
    return (
      <div className="bq-empty">
        <div className="bq-empty__title">Order not found</div>
      </div>
    );
  }

  const stage = effectiveStage(order.stage, order.due_date);
  const due = balance(order.total_amount, order.advance_amount);
  const measurementsSet = MEASUREMENT_FIELDS.filter((f) => typeof order[f] === "number");

  async function handleMarkPaid() {
    const updated = await markOrderPaid(order!.id);
    setOrder(updated);
    flash(`Order ${updated.order_code} marked paid.`, "success");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="bq-num" style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {order.order_code}
          </div>
          <h1 style={{ margin: 0 }}>{customer.name}</h1>
        </div>
        <StageBadge stage={stage} size="lg" />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button as="a" href={`/owner/orders/${order.id}/stage`} variant="secondary">
          Update stage
        </Button>
        {!order.paid && (
          <Button variant="accent" onClick={handleMarkPaid}>
            Mark paid
          </Button>
        )}
      </div>

      <Card title="Work details">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          <span>Garment: {order.garment_type === "Other" ? order.garment_type_other : order.garment_type}</span>
          {order.tailor_name ? <span>Tailor: {order.tailor_name}</span> : null}
          {order.cloth_description ? <span>Cloth: {order.cloth_description}</span> : null}
          {order.style_notes ? <span>Notes: {order.style_notes}</span> : null}
          <span>Due {formatShortDate(order.due_date)}</span>
        </div>
      </Card>

      <Card title="Cloth photo">
        <ClothPhotoUpload boutiqueId={order.boutique_id} orderId={order.id} onAttached={load} />
      </Card>

      {measurementsSet.length > 0 && (
        <Card title="Measurements">
          <div className="bq-measure-grid">
            {measurementsSet.map((f) => (
              <div key={f} className="bq-field">
                <span className="bq-field__label">
                  {MEASUREMENT_LABELS[f].n}. {MEASUREMENT_LABELS[f].label}
                </span>
                <span className="bq-num">{String(order[f])} in</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Billing">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          <span>Total: {formatMoney(order.total_amount)}</span>
          <span>Advance: {formatMoney(order.advance_amount)}</span>
          <span style={{ color: due > 0 ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>
            {order.paid ? "Paid in full" : `Balance due: ${formatMoney(due)}`}
          </span>
        </div>
      </Card>
    </div>
  );
}
