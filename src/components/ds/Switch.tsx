import * as React from "react";

export interface SwitchProps {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked = false, onChange, label, disabled = false, className = "" }: SwitchProps) {
  return (
    <label className={["bq-switch", disabled ? "bq-switch--disabled" : "", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
      <span className="bq-switch__track" data-on={String(!!checked)}>
        <span className="bq-switch__knob" />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
