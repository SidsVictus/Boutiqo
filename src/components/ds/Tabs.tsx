import * as React from "react";

export interface TabsProps {
  items?: Array<string | { value: string; label: string; count?: number }>;
  value?: string;
  onChange?: (value: string) => void;
  variant?: "underline" | "pills";
  className?: string;
}

export function Tabs({ items = [], value, onChange, variant = "underline", className = "" }: TabsProps) {
  return (
    <div className={["bq-tabs", variant === "pills" ? "bq-tabs--pills" : "", className].filter(Boolean).join(" ")} role="tablist">
      {items.map((it) => {
        const v = typeof it === "string" ? it : it.value;
        const l = typeof it === "string" ? it : it.label;
        const c = typeof it === "string" ? undefined : it.count;
        return (
          <button key={v} role="tab" aria-selected={value === v} className="bq-tab" onClick={() => onChange && onChange(v)}>
            {l}
            {c != null ? <span className="bq-tab__count">{c}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
