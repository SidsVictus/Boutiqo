"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ds/Input";
import { Eye, EyeOff } from "./icons";

/** Password field with a show/hide toggle. Same props as Input (type is fixed). */
export function PasswordInput(props: Omit<InputProps, "type" | "iconRight">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      iconRight={
        <button
          type="button"
          className="bq-input__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}
