"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";
import { listOrders } from "@/lib/data/orders";
import { listCustomers } from "@/lib/data/customers";
import { CalendarGrid, LoadLegend } from "@/components/app/CalendarGrid";
import { computeLoadByDate } from "@/lib/calc/calendarLoad";
import { OrderRow } from "@/components/app/OrderRow";
import { Button } from "@/components/ds/Button";
import { ChevronLeft, ChevronRight } from "@/components/app/icons";
import { DUES_VIEWS, groupByDueDate, matchesView, parseDuesView, type DuesView } from "@/lib/calc/dues";
import { formatDayHeading, formatMoney, localDateKey } from "@/lib/calc/format";
import { balance } from "@/lib/calc/order";
import type { Order, Customer } from "@/lib/supabase/types";

export default function OwnerCalendarPage() {
  return (
    <React.Suspense fallback={<div className="bq-skeleton" style={{ height: 320 }} />}>
      <CalendarScreen />
    </React.Suspense>
  );
}

function CalendarScreen() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const params = useSearchParams();
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [customers, setCustomers] = React.useState<Record<string, Customer>>({});
  const [view, setView] = React.useState<DuesView>(() => parseDuesView(params.get("view")));
  const [selectedDate, setSelectedDate] = React.useState<string | null>(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date") : null));
  const [month, setMonth] = React.useState(() => {
    const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  React.useEffect(() => {
    if (!boutique) return;
    let cancelled = false;
    listOrders(boutique.id).then((rows) => !cancelled && setOrders(rows));
    listCustomers(boutique.id).then((rows) => !cancelled && setCustomers(Object.fromEntries(rows.map((c) => [c.id, c]))));
    return () => {
      cancelled = true;
    };
  }, [boutique]);

  // Keep the URL shareable/back-button friendly without a navigation.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (selectedDate) url.searchParams.set("date", selectedDate);
    else url.searchParams.delete("date");
    window.history.replaceState(window.history.state, "", url);
  }, [view, selectedDate]);

  if (!boutique) return null;

  const all = orders ?? [];
  const today = new Date();
  const openOrders = all.filter((o) => o.stage !== "delivered");
  const inView = all.filter((o) => matchesView(o, view, today));
  const listed = selectedDate ? inView.filter((o) => o.due_date === selectedDate) : inView;
  const groups = groupByDueDate(listed);
  const listedBalance = listed.filter((o) => !o.paid).reduce((s, o) => s + balance(o.total_amount, o.advance_amount), 0);

  function shiftMonth(delta: number) {
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const isThisMonth = month.year === today.getFullYear() && month.month === today.getMonth();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="bq-month-nav">
        <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => shiftMonth(-1)} iconLeft={<ChevronLeft size={18} />}>
          {""}
        </Button>
        <div style={{ textAlign: "center" }}>
          <div className="bq-month-nav__title">{monthLabel}</div>
          {!isThisMonth ? (
            <button type="button" className="bq-link-btn" onClick={() => setMonth({ year: today.getFullYear(), month: today.getMonth() })}>
              Back to today
            </button>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => shiftMonth(1)} iconLeft={<ChevronRight size={18} />}>
          {""}
        </Button>
      </div>
      <LoadLegend />
      <CalendarGrid
        year={month.year}
        month={month.month}
        loadByDate={computeLoadByDate(openOrders)}
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate((cur) => (cur === d ? null : d))}
      />

      <section aria-labelledby="dues-heading">
        <div className="bq-section-head">
          <h2 id="dues-heading">{selectedDate ? `Due ${formatDayHeading(selectedDate)}` : "Dues"}</h2>
          {selectedDate ? (
            <button type="button" className="bq-link-btn" onClick={() => setSelectedDate(null)}>
              Show all dates
            </button>
          ) : null}
        </div>
        <div className="bq-chip-row" role="group" aria-label="Filter dues">
          {DUES_VIEWS.map((v) => {
            const count = all.filter((o) => matchesView(o, v.key, today) && (!selectedDate || o.due_date === selectedDate)).length;
            return (
              <button key={v.key} type="button" className="bq-chip" aria-pressed={view === v.key} onClick={() => setView(v.key)}>
                {v.label} <span className="bq-chip__count">{count}</span>
              </button>
            );
          })}
        </div>

        {orders === null ? (
          <div className="bq-skeleton" style={{ height: 120, marginTop: 12 }} />
        ) : listed.length === 0 ? (
          <p style={{ color: "var(--text-muted)", marginTop: 14 }}>{selectedDate ? "Nothing in this list is due that day." : "Nothing in this list."}</p>
        ) : (
          <>
            <p className="bq-field__hint" style={{ marginTop: 10 }}>
              {listed.length} order{listed.length === 1 ? "" : "s"} · {formatMoney(listedBalance)} balance due
            </p>
            {groups.map((g) => (
              <div key={g.date}>
                <div className="bq-day-group__title">
                  <span>
                    {formatDayHeading(g.date)}
                    {g.date === localDateKey(today) ? " · Today" : ""}
                  </span>
                  <span>{g.orders.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g.orders.map((o) => (
                    <OrderRow key={o.id} order={o} customerName={customers[o.customer_id]?.name ?? "Customer"} href={`/owner/orders/${o.id}`} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
