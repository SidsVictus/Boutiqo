"use client";

import { Button } from "@/components/ds/Button";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/lib/session/SessionContext";

/**
 * Root landing = the entry screen for a new boutique owner. Customers never
 * see this page — they open the WhatsApp tracking link the boutique sends
 * them directly, so there's no tracking-page teaser here. A returning owner
 * (or an admin, per SessionContext's unified `login`) goes to /owner/login.
 */
export default function Home() {
  const { signInWithGoogle } = useSession();

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          <Logo size={30} />
          boutiqo
        </div>
        <h1 style={{ fontSize: 24, fontFamily: "var(--font-sans)", fontWeight: 700, lineHeight: 1.25, margin: "16px 0 8px" }}>
          Your order book, on your phone
        </h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
          Sign in with the Gmail account you use for the boutique. No password to remember.
        </p>
        <Button
          variant="secondary"
          block
          onClick={() => void signInWithGoogle()}
          iconLeft={
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: "999px",
                background: "var(--surface-blush)",
                color: "var(--text-strong)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              G
            </span>
          }
        >
          Continue with Google
        </Button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 18px", color: "var(--text-faint)", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
          Already set up
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
        </div>
        <Button as="a" href="/owner/login" variant="ghost" block>
          Sign in to an existing boutique
        </Button>
        <p style={{ marginTop: 18, fontSize: 13, color: "var(--text-muted)" }}>Each boutique sees only its own customers and orders.</p>
      </div>
    </main>
  );
}
