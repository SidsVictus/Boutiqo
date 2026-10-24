"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";

/**
 * The Android app opens the site root. Inside the app (the WebView exposes
 * window.ReactNativeWebView) skip the marketing page: a signed-in user goes
 * straight to their dashboard, anyone else to the sign-in home at /site, so
 * installed APKs keep working unchanged. A cover hides the marketing page
 * while the session check is in flight.
 */
export function AppShellRedirect() {
  const router = useRouter();
  const { session } = useSession();
  const [inApp, setInApp] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the WebView bridge only exists in the browser, so it can't be read during render.
    setInApp(!!window.ReactNativeWebView);
  }, []);

  React.useEffect(() => {
    if (!inApp || session === undefined) return;
    router.replace(session?.kind === "owner" ? "/owner/dashboard" : session?.kind === "admin" ? "/admin/dashboard" : "/site");
  }, [inApp, session, router]);

  return inApp ? <div className="bq-auth-bg" aria-busy="true" style={{ position: "fixed", inset: 0, zIndex: 100 }} /> : null;
}
