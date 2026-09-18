"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getBoutique } from "@/lib/data/boutiques";
import { listOrders } from "@/lib/data/orders";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { formatShortDate } from "@/lib/calc/format";
import type { Boutique, Order } from "@/lib/supabase/types";

const STATUS_TONE: Record<Boutique["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  on_hold: "warning",
  disabled: "neutral",
};

export default function AdminBoutiqueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [boutique, setBoutique] = React.useState<Boutique | null | undefined>(undefined);
  const [orders, setOrders] = React.useState<Order[]>([]);

  React.useEffect(() => {
    getBoutique(id).then(async (b) => {
      setBoutique(b);
      if (b) setOrders(await listOrders(b.id));
    });
  }, [id]);

  if (boutique === undefined) return <div className="bq-skeleton" style={{ height: 200 }} />;
  if (!boutique) return <div className="bq-empty"><div className="bq-empty__title">Boutique not found</div></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <Card title={boutique.name} meta={`${boutique.area} · ${boutique.category}`} action={<Badge tone={STATUS_TONE[boutique.status]}>{boutique.status.replace("_", " ")}</Badge>}>
        <div className="bq-g2" style={{ marginTop: 8, fontSize: 14 }}>
          <span>Owner: {boutique.owner_name}</span>
          <span>Email: {boutique.email}</span>
          <span>Phone: {boutique.phone || "—"}</span>
          <span>GST: {boutique.gst_number || "—"}</span>
          <span>Joined: {formatShortDate(boutique.created_at)}</span>
          <span>Orders: {orders.length}</span>
        </div>
      </Card>
      <Button as="a" href={`/admin/boutiques/${boutique.id}/access`} variant="secondary">
        Manage access
      </Button>
      <Card title="Recent activity">
        {orders.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No orders yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {[...orders]
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
              .slice(0, 6)
              .map((o) => (
                <div key={o.id} style={{ fontSize: 14, display: "flex", justifyContent: "space-between" }}>
                  <span>{o.order_code}</span>
                  <span style={{ color: "var(--text-muted)" }}>{o.stage}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
