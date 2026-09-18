import * as React from "react";

/**
 * Generic design-system primitive (5-level blush→signal scale). NOT used for
 * Boutiqo's actual deadline calendar — CLAUDE_CODE_HANDOFF.md's "changes after
 * first implementation" section specifies a different, final 3-colour thermal
 * scale (green/amber/red) for that specific screen. See
 * src/components/app/CalendarDayCell.tsx + src/lib/calc/calendarLoad.ts for the
 * scale actually used in the app. This component is ported for inventory
 * completeness / any future generic density-cell use.
 */
export function loadLevel(count: number, capacity = 8): number {
  if (!count) return 0;
  const r = count / capacity;
  if (r <= 0.25) return 1;
  if (r <= 0.6) return 2;
  if (r < 1) return 3;
  return 4;
}

export interface LoadCellProps {
  day: number | string;
  count?: number;
  capacity?: number;
  level?: 0 | 1 | 2 | 3 | 4;
  selected?: boolean;
  muted?: boolean;
  showUnit?: boolean;
  onClick?: () => void;
  className?: string;
}

export function LoadCell({ day, count = 0, capacity = 8, level, selected = false, muted = false, showUnit = false, onClick, className = "" }: LoadCellProps) {
  const lv = level != null ? level : loadLevel(count, capacity);
  return (
    <button
      type="button"
      className={["bq-loadcell", className].filter(Boolean).join(" ")}
      data-level={lv}
      data-selected={String(!!selected)}
      data-muted={String(!!muted)}
      onClick={onClick}
      aria-label={`${day}: ${count} due`}
    >
      <span className="bq-loadcell__day">{day}</span>
      {count ? (
        <span className="bq-loadcell__count">
          {count}
          {showUnit ? " due" : ""}
        </span>
      ) : null}
    </button>
  );
}
