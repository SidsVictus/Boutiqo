"use client";

import * as React from "react";
import { Button } from "@/components/ds/Button";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/lib/session/SessionContext";
import { Check } from "@/components/app/icons";

export default function OwnerSignoutPage() {
  const { signOut } = useSession();

  React.useEffect(() => {
    signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card" style={{ textAlign: "center" }}>
        <div className="bq-auth-brand" style={{ justifyContent: "center" }}>
          <Logo size={30} />
          boutiqo
        </div>
        <div style={{ margin: "12px auto", width: 56, height: 56, borderRadius: "999px", background: "var(--success-bg)", color: "var(--green-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={26} />
        </div>
        <h1 className="bq-brand" style={{ fontSize: 22, marginBottom: 4 }}>
          Signed out
        </h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>You&apos;ve been signed out of Boutiqo.</p>
        <Button as="a" href="/owner/login" block>
          Log in again
        </Button>
      </div>
    </main>
  );
}
