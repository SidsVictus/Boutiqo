import * as React from "react";

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked = false, onChange, label, description, disabled = false, className = "" }: CheckboxProps) {
  return (
    <label className={["bq-choice", disabled ? "bq-choice--disabled" : "", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
      <span className="bq-choice__box bq-choice__box--check" data-on={String(!!checked)}>
        {checked ? (
          <svg className="bq-choice__mark" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.8 6.4 4.5 9l5.7-6" />
          </svg>
        ) : null}
      </span>
      <span className="bq-choice__text">
        <span>{label}</span>
        {description ? <span className="bq-choice__desc">{description}</span> : null}
      </span>
    </label>
  );
}
