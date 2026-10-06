"use client";

import Link from "next/link";
import { Button } from "@/components/ds/Button";
import { GoogleButton } from "@/components/app/GoogleButton";
import { useAuthPage } from "@/lib/auth/useAuthPage";

/**
 * Root landing = the entry screen for a new boutique owner. Customers never
 * see this page — they open the WhatsApp tracking link the boutique sends
 * them directly, so there's no tracking-page teaser here. A returning owner
 * (or an admin, per SessionContext's unified `login`) goes to /owner/login.
 */
export default function Home() {
  const { urlError } = useAuthPage();

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        <h1 style={{ fontSize: 24, fontFamily: "var(--font-sans)", fontWeight: 700, lineHeight: 1.25, margin: "16px 0 22px" }}>
          Your order book, on your phone
        </h1>
        {urlError ? (
          <div role="alert" className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            {urlError}
          </div>
        ) : null}
        <GoogleButton />
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px", color: "var(--text-muted)", fontSize: 15 }}>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
          or
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
        </div>
        <Button as="a" href="/owner/login" variant="ghost" block>
          Sign in to an existing boutique
        </Button>
        <p style={{ marginTop: 20, fontSize: 15, color: "var(--text-muted)", display: "flex", gap: 16 }}>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms &amp; Conditions</Link>
        </p>
      </div>
    </main>
  );
}
