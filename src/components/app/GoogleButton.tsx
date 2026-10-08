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
        className="bq-google-btn"
        iconLeft={
          <span className="bq-google-btn__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
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
