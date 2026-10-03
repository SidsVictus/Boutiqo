"use client";

import * as React from "react";
import { listBoutiques } from "@/lib/data/boutiques";
import { StatTile } from "@/components/app/StatTile";
import { Badge } from "@/components/ds/Badge";
import Link from "next/link";
import type { Boutique } from "@/lib/supabase/types";

const STATUS_TONE: Record<Boutique["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  on_hold: "warning",
  disabled: "neutral",
};

export default function AdminDashboardPage() {
  const [boutiques, setBoutiques] = React.useState<Boutique[]>([]);

  React.useEffect(() => {
    listBoutiques().then(setBoutiques);
  }, []);

  const active = boutiques.filter((b) => b.status === "active").length;
  const onHold = boutiques.filter((b) => b.status === "on_hold").length;
  const disabled = boutiques.filter((b) => b.status === "disabled").length;
  const recent = [...boutiques].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bq-g3">
        <StatTile label="Total boutiques" value={boutiques.length} href="/admin/boutiques" />
        <StatTile label="Active" value={active} href="/admin/boutiques?status=active" />
        <StatTile label="On hold / disabled" value={onHold + disabled} href="/admin/boutiques?status=inactive" />
      </div>
      <div>
        <div className="bq-section-head">
          <h2>Recently joined</h2>
          <Link href="/admin/boutiques">All boutiques</Link>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recent.map((b) => (
            <Link key={b.id} href={`/admin/boutiques/${b.id}`} className="bq-order-row">
              <div className="bq-order-row__main">
                <span className="bq-order-row__title">{b.name}</span>
                <span className="bq-order-row__meta">{b.area} · {b.owner_name}</span>
              </div>
              <Badge tone={STATUS_TONE[b.status]}>{b.status.replace("_", " ")}</Badge>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
