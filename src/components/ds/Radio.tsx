import * as React from "react";

export interface RadioProps {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  value?: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Radio({ checked = false, onChange, name, value, label, description, disabled = false, className = "" }: RadioProps) {
  return (
    <label className={["bq-choice", disabled ? "bq-choice--disabled" : "", className].filter(Boolean).join(" ")}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
      <span className="bq-choice__box bq-choice__box--radio" data-on={String(!!checked)}>
        {checked ? <span className="bq-choice__dot" /> : null}
      </span>
      <span className="bq-choice__text">
        <span>{label}</span>
        {description ? <span className="bq-choice__desc">{description}</span> : null}
      </span>
    </label>
  );
}
