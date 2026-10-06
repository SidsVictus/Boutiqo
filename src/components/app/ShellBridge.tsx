"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

type Insets = { top: number; bottom: number };

function applyInsets() {
  const insets = (window as unknown as { BoutiqoInsets?: Insets }).BoutiqoInsets;
  if (!insets) return;
  const s = document.documentElement.style;
  s.setProperty("--bq-shell-inset-top", `${Math.max(0, Number(insets.top) || 0)}px`);
  s.setProperty("--bq-shell-inset-bottom", `${Math.max(0, Number(insets.bottom) || 0)}px`);
}

/**
 * Glue for the Android app (android/App.tsx), which draws the page full
 * screen, under the phone's status and navigation bars. Does nothing in a
 * normal browser.
 *  - Bar sizes: the app passes them as window.BoutiqoInsets; they become the
 *    --bq-shell-inset-* CSS variables behind --safe-top/--safe-bottom.
 *    Re-applied here because hydration resets <html>'s inline style.
 *  - Status-bar icons: light over the dark carpet of the sign-in and
 *    tracking pages, dark over the light app pages; sent after each navigation.
 */
export function ShellBridge() {
  const pathname = usePathname();

  React.useEffect(() => {
    if (!window.ReactNativeWebView) return;
    applyInsets();
    window.addEventListener("boutiqo:insets", applyInsets);
    return () => window.removeEventListener("boutiqo:insets", applyInsets);
  }, []);

  React.useEffect(() => {
    const bridge = window.ReactNativeWebView;
    if (!bridge) return;
    applyInsets();
    const send = () => {
      const style = document.querySelector(".bq-auth-bg") ? "light" : "dark";
      bridge.postMessage(JSON.stringify({ type: "boutiqo:statusbar", style }));
    };
    send();
    // Client pages can render their layout a moment after navigation.
    const t = window.setTimeout(send, 300);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
