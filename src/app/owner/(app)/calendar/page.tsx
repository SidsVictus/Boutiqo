"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { listOrders } from "@/lib/data/orders";
import { getCustomer } from "@/lib/data/customers";
import { CalendarGrid, LoadLegend } from "@/components/app/CalendarGrid";
import { calendarLoadByDate } from "@/lib/data/store";
import { OrderRow } from "@/components/app/OrderRow";
import type { Order, Customer } from "@/lib/supabase/types";

export default function OwnerCalendarPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [customers, setCustomers] = React.useState<Record<string, Customer>>({});
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const today = new Date();

  React.useEffect(() => {
    if (!boutique) return;
    listOrders(boutique.id).then(async (rows) => {
      setOrders(rows);
      const map: Record<string, Customer> = {};
      for (const o of rows) {
        if (!map[o.customer_id]) {
          const c = await getCustomer(o.customer_id);
          if (c) map[o.customer_id] = c;
        }
      }
      setCustomers(map);
    });
  }, [boutique]);

  if (!boutique) return null;

  const dayOrders = selectedDate ? orders.filter((o) => o.due_date === selectedDate) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <LoadLegend />
      <CalendarGrid year={today.getFullYear()} month={today.getMonth()} loadByDate={calendarLoadByDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      {selectedDate ? (
        <div>
          <h2 style={{ marginBottom: 10 }}>Due {selectedDate}</h2>
          {dayOrders.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>Nothing due this day.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayOrders.map((o) => (
                <OrderRow key={o.id} order={o} customerName={customers[o.customer_id]?.name ?? "Customer"} href={`/owner/orders/${o.id}`} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
