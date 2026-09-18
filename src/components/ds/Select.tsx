import * as React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  options?: Array<string | { value: string; label: string }>;
  placeholder?: string;
}

let idCounter = 0;

export function Select({ label, hint, error, required = false, options = [], placeholder, className = "", id, children, ...rest }: SelectProps) {
  const fid = React.useMemo(() => id || `bq-${(idCounter++).toString(36)}`, [id]);
  return (
    <div className="bq-field">
      {label ? (
        <label className="bq-field__label" htmlFor={fid}>
          {label}
          {required ? <span className="bq-field__req"> *</span> : null}
        </label>
      ) : null}
      <select id={fid} className={["bq-select", className].filter(Boolean).join(" ")} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
        {children}
      </select>
      {error ? <div className="bq-field__error">{error}</div> : hint ? <div className="bq-field__hint">{hint}</div> : null}
    </div>
  );
}
