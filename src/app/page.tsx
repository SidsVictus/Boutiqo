"use client";

import Link from "next/link";
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
        <h1 className="bq-auth-title">
          Your order book, on your phone
        </h1>
        {urlError ? (
          <div role="alert" className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            {urlError}
          </div>
        ) : null}
        <GoogleButton />
        <div className="bq-or">or</div>
        <Link href="/owner/login" className="bq-auth-textlink">
          Sign in to an existing boutique
        </Link>
        <p className="bq-auth-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms &amp; Conditions</Link>
        </p>
      </div>
    </main>
  );
}
