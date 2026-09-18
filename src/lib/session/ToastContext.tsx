"use client";

import * as React from "react";
import { Toast, type ToastProps } from "@/components/ds/Toast";

interface ToastState {
  id: number;
  tone: ToastProps["tone"];
  message: string;
}

interface ToastContextValue {
  flash: (message: string, tone?: ToastProps["tone"]) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 2600;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = React.useCallback((message: string, tone: ToastProps["tone"] = "default") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Toasts replace each other, never stack — new id triggers a fresh mount/animation.
    setToast({ id: Date.now(), tone, message });
    timerRef.current = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ flash }}>
      {children}
      <div className="bq-toast-host" aria-live="polite">
        {toast ? (
          <Toast key={toast.id} tone={toast.tone}>
            {toast.message}
          </Toast>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
