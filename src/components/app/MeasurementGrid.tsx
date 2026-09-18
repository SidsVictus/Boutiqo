"use client";

import { Input } from "@/components/ds/Input";
import { MEASUREMENT_FIELDS, MEASUREMENT_LABELS } from "./measurementLabels";
import type { MeasurementField } from "@/lib/supabase/types";

export type MeasurementValues = Partial<Record<MeasurementField, string>>;

/** 14-field measurement grid — 2 cols mobile / 3 cols web, `in` suffix hidden
 * on mobile (per CLAUDE_CODE_HANDOFF.md §3's "what changes" table). All 14
 * fields optional, one decimal. The suffix visibility is handled with a CSS
 * class rather than JS viewport detection, consistent with the rest of the
 * responsive approach (see docs/phase2-report.md §5). */
export function MeasurementGrid({ values, onChange }: { values: MeasurementValues; onChange: (field: MeasurementField, value: string) => void }) {
  return (
    <div className="bq-measure-grid">
      {MEASUREMENT_FIELDS.map((field) => {
        const meta = MEASUREMENT_LABELS[field];
        return (
          <Input
            key={field}
            label={`${meta.n}. ${meta.label}`}
            numeric
            inputMode="decimal"
            value={values[field] ?? ""}
            onChange={(e) => onChange(field, e.target.value)}
            iconRight={<span className="bq-measure-unit">in</span>}
          />
        );
      })}
    </div>
  );
}
