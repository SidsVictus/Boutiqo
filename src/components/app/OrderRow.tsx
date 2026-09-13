import Link from "next/link";
import { StageBadge } from "@/components/ds/StageBadge";
import { effectiveStage, balance } from "@/lib/calc/order";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import { ChevronRight } from "./icons";
import type { Order } from "@/lib/supabase/types";

export function OrderRow({ order, customerName, href }: { order: Order; customerName: string; href: string }) {
  const stage = effectiveStage(order.stage, order.due_date);
  const fill = stage === "overdue" ? "overdue" : stage === "ready" ? "ready" : "default";
  return (
    <Link href={href} className="bq-order-row" data-fill={fill}>
      <div className="bq-order-row__main">
        <span className="bq-order-row__title">
          {customerName} · {order.garment_type === "Other" ? order.garment_type_other || "Other" : order.garment_type}
        </span>
        <span className="bq-order-row__meta">
          {order.order_code} · Due {formatShortDate(order.due_date)} · {formatMoney(balance(order.total_amount, order.advance_amount))} due
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StageBadge stage={stage} />
        <ChevronRight size={18} />
      </div>
    </Link>
  );
}
