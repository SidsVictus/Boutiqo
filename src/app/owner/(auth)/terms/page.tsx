"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Checkbox } from "@/components/ds/Checkbox";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/lib/session/SessionContext";
import { registerBoutique } from "@/lib/data/boutiques";
import { ApiError } from "@/lib/data/store";

export default function OwnerTermsPage() {
  const router = useRouter();
  const { session, draftSignup, clearDraftSignup, refreshSession } = useSession();
  const [tnc, setTnc] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);

  React.useEffect(() => {
    if (!draftSignup?.fields && !accepted && session?.kind !== "owner") router.replace("/owner/signup");
  }, [draftSignup, accepted, session, router]);

  if (!draftSignup?.fields && !accepted) return null;

  const canContinue = tnc && privacy;

  async function handleAccept() {
    if (!draftSignup?.fields) return;
    setLoading(true);
    setError(null);
    try {
      await registerBoutique({
        ownerUserId: draftSignup.userId,
        email: draftSignup.email,
        terms: { tnc, privacy },
        ...draftSignup.fields,
      });
      setAccepted(true);
      await refreshSession();
      clearDraftSignup();
      router.push("/owner/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete registration. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          <Logo size={30} />
          boutiqo
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Terms &amp; privacy</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Review and accept both before you continue.</p>
        {error ? (
          <div className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
          <Checkbox checked={tnc} onChange={(e) => setTnc(e.target.checked)} label="I accept the Terms & conditions" />
          <Checkbox checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} label="I accept the Privacy policy" />
        </div>
        <Button block disabled={!canContinue || loading} onClick={handleAccept}>
          {loading ? "Setting up…" : "Continue"}
        </Button>
      </div>
    </main>
  );
}
