import { balance, effectiveStage } from "./order";
import type { Order } from "@/lib/supabase/types";

/** Filters for the dues list under the calendar. Dashboard tiles link to
 * /owner/calendar?view=<DuesView>. */
export type DuesView = "open" | "overdue" | "ready" | "unpaid" | "all";

export const DUES_VIEWS: Array<{ key: DuesView; label: string }> = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "ready", label: "Ready" },
  { key: "unpaid", label: "Unpaid" },
  { key: "all", label: "All" },
];

export function parseDuesView(raw: string | null | undefined): DuesView {
  return DUES_VIEWS.some((v) => v.key === raw) ? (raw as DuesView) : "open";
}

export function matchesView(order: Order, view: DuesView, today: Date = new Date()): boolean {
  const stage = effectiveStage(order.stage, order.due_date, today);
  switch (view) {
    case "open":
      return order.stage !== "delivered";
    case "overdue":
      return stage === "overdue";
    case "ready":
      return order.stage === "ready";
    case "unpaid":
      return !order.paid && balance(order.total_amount, order.advance_amount) > 0;
    case "all":
      return true;
  }
}

/** Orders grouped by due date, earliest first (so overdue days lead). */
export function groupByDueDate(orders: Order[]): Array<{ date: string; orders: Order[] }> {
  const map = new Map<string, Order[]>();
  for (const o of [...orders].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.order_code.localeCompare(b.order_code))) {
    const list = map.get(o.due_date) ?? [];
    list.push(o);
    map.set(o.due_date, list);
  }
  return [...map.entries()].map(([date, list]) => ({ date, orders: list }));
}

/** Unpaid balance across orders. */
export function outstandingTotal(orders: Order[]): number {
  return orders.filter((o) => !o.paid).reduce((sum, o) => sum + balance(o.total_amount, o.advance_amount), 0);
}
