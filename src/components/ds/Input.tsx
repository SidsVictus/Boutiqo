import * as React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Renders a textarea. */
  multiline?: boolean;
  rows?: number;
  /** Tabular mono figures — measurements, amounts, phone numbers, order codes. */
  numeric?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

let idCounter = 0;

export function Input({
  label,
  hint,
  error,
  required = false,
  multiline = false,
  rows,
  numeric = false,
  iconLeft,
  iconRight,
  className = "",
  id,
  ...rest
}: InputProps) {
  const fid = React.useMemo(() => id || `bq-${(idCounter++).toString(36)}`, [id]);
  const cls = [
    "bq-input",
    multiline ? "bq-input--multiline" : "",
    numeric ? "bq-input--numeric" : "",
    error ? "bq-input--invalid" : "",
    iconLeft ? "bq-input--has-left" : "",
    iconRight ? "bq-input--has-right" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="bq-field">
      {label ? (
        <label className="bq-field__label" htmlFor={fid}>
          {label}
          {required ? <span className="bq-field__req"> *</span> : null}
        </label>
      ) : null}
      <div className="bq-input__wrap">
        {iconLeft ? <span className="bq-input__affix bq-input__affix--left">{iconLeft}</span> : null}
        {multiline ? (
          <textarea
            id={fid}
            className={cls}
            aria-invalid={!!error}
            rows={rows}
            {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input id={fid} className={cls} aria-invalid={!!error} {...rest} />
        )}
        {iconRight ? <span className="bq-input__affix bq-input__affix--right">{iconRight}</span> : null}
      </div>
      {error ? <div className="bq-field__error">{error}</div> : hint ? <div className="bq-field__hint">{hint}</div> : null}
    </div>
  );
}
