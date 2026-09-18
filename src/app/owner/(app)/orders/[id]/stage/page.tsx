"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrder, updateOrderStage } from "@/lib/data/orders";
import { StageRows } from "@/components/app/StageRows";
import { useToast } from "@/lib/session/ToastContext";
import { STAGES } from "@/components/ds/StageBadge";
import type { Order, OrderStage } from "@/lib/supabase/types";

export default function UpdateStagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { flash } = useToast();
  const [order, setOrder] = React.useState<Order | null>(null);

  React.useEffect(() => {
    getOrder(id).then(setOrder);
  }, [id]);

  if (!order) return <div className="bq-skeleton" style={{ height: 240 }} />;

  async function handleSelect(stage: OrderStage) {
    const updated = await updateOrderStage(order!.id, stage);
    setOrder(updated);
    flash(`Order ${updated.order_code} moved to ${STAGES[stage].toLowerCase()}.`);
    setTimeout(() => router.push(`/owner/orders/${updated.id}`), 500);
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
        Order {order.order_code} — tap a stage to move it there.
      </p>
      <StageRows current={order.stage} onSelect={handleSelect} />
    </div>
  );
}
