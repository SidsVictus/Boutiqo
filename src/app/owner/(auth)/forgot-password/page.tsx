"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { useSession } from "@/lib/session/SessionContext";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth/redirects";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useSession();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount.
    if (code) setBanner(AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.reset_link);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    setError(null);
    setBanner(null);
    const result = await requestPasswordReset(trimmed);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Couldn't send the reset email. Please try again.");
      return;
    }
    setSentTo(trimmed);
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        {sentTo ? (
          <>
            <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Check your email</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }} role="status">
              If an account exists for <strong>{sentTo}</strong>, we&apos;ve sent a link to reset your password. It may take a minute to arrive; check your spam folder too.
            </p>
            <Button as="a" href="/owner/login" block>
              Back to log in
            </Button>
            <p style={{ marginTop: 14, fontSize: 16 }}>
              Didn&apos;t get it?{" "}
              <button type="button" className="bq-link-button" onClick={() => setSentTo(null)}>
                Send again
              </button>
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Forgot password?</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Enter your account email and we&apos;ll send you a link to set a new password.</p>
            {banner ? (
              <div role="alert" className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
                {banner}
              </div>
            ) : null}
            <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="Email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} />
              <Button type="submit" block disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <p style={{ marginTop: 18, fontSize: 16 }}>
              Remembered it? <Link href="/owner/login">Log in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
