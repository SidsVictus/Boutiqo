"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Checkbox } from "@/components/ds/Checkbox";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/lib/session/SessionContext";
import { acceptTerms, getBoutiqueByOwnerUserId } from "@/lib/data/boutiques";

export default function OwnerTermsPage() {
  const router = useRouter();
  const { session, draftSignup, clearDraftSignup, setSessionDirect } = useSession();
  const [tnc, setTnc] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);

  React.useEffect(() => {
    // Once acceptance completes we clear the draft and navigate away in the
    // same tick as setting a full session — don't race that with a redirect
    // back to signup just because the draft is now gone.
    if (!draftSignup && !accepted && session?.kind !== "owner") router.replace("/owner/signup");
  }, [draftSignup, accepted, session, router]);

  if (!draftSignup && !accepted) return null;

  const canContinue = tnc && privacy;

  async function handleAccept() {
    setLoading(true);
    const boutique = await getBoutiqueByOwnerUserId(draftSignup!.userId);
    if (!boutique) {
      setLoading(false);
      return;
    }
    const updated = await acceptTerms(boutique.id);
    setAccepted(true);
    setSessionDirect({ kind: "owner", boutique: updated });
    clearDraftSignup();
    router.push("/owner/dashboard");
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
