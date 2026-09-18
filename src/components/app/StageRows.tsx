import { STAGE_ORDER, stageIndex, type Stage } from "@/lib/calc/order";
import { STAGES } from "@/components/ds/StageBadge";

/** 5-row stage update list: current outlined, completed struck-through/greyed,
 * tapping any row sets that stage. Background tint uses the stage's own
 * colour (bq-stage--* backgrounds), per the handoff's "stage-coloured fills". */
export function StageRows({ current, onSelect }: { current: Stage; onSelect: (stage: Stage) => void }) {
  const currentIdx = stageIndex(current);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {STAGE_ORDER.map((stage, i) => {
        const done = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <button
            key={stage}
            type="button"
            className="bq-stage-row"
            data-current={isCurrent}
            data-done={done}
            style={{ background: done ? undefined : `var(--stage-${stage}-bg)`, color: done ? undefined : `var(--stage-${stage}-ink)` }}
            onClick={() => onSelect(stage)}
          >
            <span className="bq-stage-row__num">{i + 1}</span>
            <span className="bq-stage-row__label">{STAGES[stage]}</span>
          </button>
        );
      })}
    </div>
  );
}
