"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { PasswordInput } from "@/components/app/PasswordInput";
import { useSession } from "@/lib/session/SessionContext";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * Reached from the reset email via /auth/callback, which has already turned
 * the link into a (recovery) session. Without one, the link was invalid or
 * already used.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { session, draftSignup, updatePassword } = useSession();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const signedIn = !!session || !!draftSignup;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setConfirmError(null);
    setFormError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (confirm !== password) {
      setConfirmError("Passwords don't match");
      return;
    }
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (!result.ok) {
      if (result.code === "same_password") setPasswordError(result.message ?? null);
      else setFormError(result.message ?? "Couldn't update your password. Please try again.");
      return;
    }
    setDone(true);
  }

  function continueToApp() {
    if (session?.kind === "admin") router.replace("/admin/dashboard");
    else if (session?.kind === "owner") router.replace("/owner/dashboard");
    else router.replace("/owner/register");
  }

  let body: React.ReactNode;
  if (session === undefined) {
    body = <div className="bq-skeleton" style={{ height: 180 }} aria-busy="true" />;
  } else if (done) {
    body = (
      <>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Password updated</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }} role="status">
          Your new password is set. Use it next time you log in.
        </p>
        <Button block onClick={continueToApp}>
          Continue
        </Button>
      </>
    );
  } else if (!signedIn) {
    body = (
      <>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Link expired</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>This password reset link is invalid, expired or already used. Request a new one.</p>
        <Button as="a" href="/owner/forgot-password" block>
          Request a new link
        </Button>
        <p style={{ marginTop: 18, fontSize: 16 }}>
          <Link href="/owner/login">Back to log in</Link>
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Set a new password</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Choose a password you don&apos;t use anywhere else.</p>
        {formError ? (
          <div role="alert" className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            {formError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PasswordInput
            label="New password"
            required
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError ?? undefined}
          />
          <PasswordInput label="Confirm new password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmError ?? undefined} />
          <Button type="submit" block disabled={loading}>
            {loading ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </>
    );
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        {body}
      </div>
    </main>
  );
}
