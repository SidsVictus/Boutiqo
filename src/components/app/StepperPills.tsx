export interface StepDef {
  key: string;
  letter: string;
  label: string;
}

export function StepperPills({ steps, currentIndex, onJump }: { steps: StepDef[]; currentIndex: number; onJump: (index: number) => void }) {
  return (
    <div className="bq-stepper" role="tablist" aria-label="New order steps">
      {steps.map((step, i) => {
        const state = i === currentIndex ? "current" : i < currentIndex ? "completed" : "upcoming";
        return (
          <button key={step.key} type="button" className="bq-stepper__pill" data-state={state} onClick={() => onJump(i)} role="tab" aria-selected={i === currentIndex}>
            <span className="bq-stepper__pill-letter">{step.letter}</span>
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
