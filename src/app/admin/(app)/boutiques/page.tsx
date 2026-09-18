"use client";

import * as React from "react";
import Link from "next/link";
import { listBoutiques } from "@/lib/data/boutiques";
import { Input } from "@/components/ds/Input";
import { Badge } from "@/components/ds/Badge";
import { Search } from "@/components/app/icons";
import type { Boutique } from "@/lib/supabase/types";

const STATUS_TONE: Record<Boutique["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  on_hold: "warning",
  disabled: "neutral",
};

export default function AdminBoutiquesPage() {
  const [search, setSearch] = React.useState("");
  const [boutiques, setBoutiques] = React.useState<Boutique[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: shows a fresh skeleton while a new search resolves.
    setBoutiques(null);
    listBoutiques(search).then((rows) => !cancelled && setBoutiques(rows));
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Input placeholder="Search by name, area or owner" iconLeft={<Search size={16} />} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search boutiques" />
      {boutiques === null ? (
        <div className="bq-skeleton" style={{ height: 200 }} />
      ) : boutiques.length === 0 ? (
        <div className="bq-empty">
          <div className="bq-empty__title">No boutiques found</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {boutiques.map((b) => (
            <Link key={b.id} href={`/admin/boutiques/${b.id}`} className="bq-order-row">
              <div className="bq-order-row__main">
                <span className="bq-order-row__title">{b.name}</span>
                <span className="bq-order-row__meta">{b.area} · {b.owner_name}</span>
              </div>
              <Badge tone={STATUS_TONE[b.status]}>{b.status.replace("_", " ")}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
