"use client";

import * as React from "react";

/**
 * The Android app opens the site root. Inside the app (the WebView exposes
 * window.ReactNativeWebView) skip the marketing page and go straight to the
 * sign-in home at /site, so installed APKs keep working unchanged.
 */
export function AppShellRedirect() {
  React.useEffect(() => {
    if ((window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView) window.location.replace("/site");
  }, []);
  return null;
}
