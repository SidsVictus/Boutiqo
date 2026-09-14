"use client";

import { loadBand, LOAD_BAND_LABEL } from "@/lib/calc/calendarLoad";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  loadByDate: Record<string, number>;
  selectedDate?: string | null;
  today?: Date;
  disablePast?: boolean;
  onSelectDate?: (dateKey: string) => void;
}

/** 7-column, Monday-first month grid using Boutiqo's 3-colour thermal scale. */
export function CalendarGrid({ year, month, loadByDate, selectedDate, today = new Date(), disablePast = false, onSelectDate }: CalendarGridProps) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay(): 0=Sun..6=Sat. We want Monday-first: 0=Mon..6=Sun.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const todayKey = toKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = toKey(new Date(year, month, day));
    cells.push({ day, key });
  }

  return (
    <div>
      <div className="bq-calendar-grid" style={{ marginBottom: 8 }}>
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="bq-label" style={{ textAlign: "center" }}>
            {w}
          </div>
        ))}
      </div>
      <div className="bq-calendar-grid">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`blank-${i}`} />;
          const count = loadByDate[cell.key] ?? 0;
          const band = loadBand(count);
          const isPast = disablePast && cell.key < todayKey;
          return (
            <button
              key={cell.key}
              type="button"
              className="bq-calendar-cell"
              data-band={isPast ? undefined : band}
              data-muted={isPast ? "true" : undefined}
              data-selected={selectedDate === cell.key ? "true" : undefined}
              disabled={isPast}
              onClick={() => onSelectDate?.(cell.key)}
              aria-label={`${cell.day}: ${count} due, ${LOAD_BAND_LABEL[band]}`}
            >
              <span className="bq-calendar-cell__day">{cell.day}</span>
              {count > 0 ? <span className="bq-calendar-cell__count">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LoadLegend() {
  return (
    <div className="bq-load-legend">
      <span className="bq-load-legend__item">
        <span className="bq-load-legend__swatch" style={{ background: "var(--green-600)" }} />
        Free
      </span>
      <span className="bq-load-legend__item">
        <span className="bq-load-legend__swatch" style={{ background: "var(--amber-600)" }} />
        Low work
      </span>
      <span className="bq-load-legend__item">
        <span className="bq-load-legend__swatch" style={{ background: "var(--signal-600)" }} />
        Too busy
      </span>
    </div>
  );
}
