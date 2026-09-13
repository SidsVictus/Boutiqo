import { STAGE_ORDER, stageIndex } from "@/lib/calc/order";
import type { EffectiveOrderStage, OrderStage } from "@/lib/supabase/types";

const TRACK_STAGES = STAGE_ORDER.slice(0, 4); // Received, Cutting, Stitching, Ready — per handoff §2

/** 4-numbered-disc progress list on the customer tracking page. An overdue
 * order is shown at the same position as "cutting" for progress purposes
 * (matches the owner-stage screen's treatment). "Delivered" shows all 4 done. */
export function TrackingProgress({ stage }: { stage: EffectiveOrderStage }) {
  const allDone = stage === "delivered";
  const positionStage: OrderStage = stage === "overdue" ? "cutting" : (stage as OrderStage);
  const currentIdx = Math.min(stageIndex(positionStage), 3);

  return (
    <div className="bq-track-progress">
      {TRACK_STAGES.map((s, i) => {
        const done = allDone || i < currentIdx;
        const current = !allDone && i === currentIdx;
        const label = s.charAt(0).toUpperCase() + s.slice(1);
        return (
          <div key={s} className="bq-track-progress__step" data-done={done} data-current={current}>
            <span className="bq-track-progress__line" />
            <span className="bq-track-progress__disc">{i + 1}</span>
            <span className="bq-track-progress__label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
