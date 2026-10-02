"use client";

import * as React from "react";
import { Button } from "@/components/ds/Button";
import { useSession } from "@/lib/session/SessionContext";

/** "Continue with Google", shared by the home and signup pages. Shows its own failure message. */
export function GoogleButton({ variant = "secondary" }: { variant?: "secondary" | "primary" }) {
  const { signInWithGoogle } = useSession();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    // On success the page navigates away (or the Android app opens a
    // sign-in tab); re-enable the button in case the user comes back.
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Google sign-in isn't available right now.");
  }

  return (
    <>
      <Button
        variant={variant}
        block
        disabled={busy}
        onClick={() => void start()}
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
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? (
        <p role="alert" className="bq-field__error" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
