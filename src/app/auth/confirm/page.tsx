"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/redirects";

/**
 * Landing page for emailed links (password reset, signup confirmation)
 * requested with the implicit flow (see lib/supabase/implicit.ts). Supabase
 * puts the session — or an error — in the URL fragment, which never reaches
 * the server, so it's read here, stored in the normal cookie-backed client,
 * and the user is sent on: reset form, or /auth/callback to route them by
 * account. Query-style links (?code= / ?token_hash=) are forwarded to
 * /auth/callback unchanged.
 */
export default function AuthConfirmPage() {
  React.useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const next = safeNextPath(query.get("next"));
    const isRecovery = next === "/owner/reset-password" || hash.get("type") === "recovery";
    const fail = () => window.location.replace(isRecovery ? "/owner/forgot-password?error=reset_link" : "/owner/login?error=link");

    if (query.get("code") || query.get("token_hash")) {
      window.location.replace(`/auth/callback${window.location.search}`);
      return;
    }
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (hash.get("error") || query.get("error") || !accessToken || !refreshToken) {
      fail();
      return;
    }
    // Don't leave tokens in the address bar or history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) fail();
        else window.location.replace(isRecovery ? "/owner/reset-password" : "/auth/callback?established=1");
      }, fail);
  }, []);

  return (
    <main className="bq-auth-bg" aria-busy="true">
      <div className="bq-auth-card" style={{ textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Signing you in…</p>
      </div>
    </main>
  );
}
