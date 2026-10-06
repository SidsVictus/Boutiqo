"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { GoogleButton } from "@/components/app/GoogleButton";
import { PasswordInput } from "@/components/app/PasswordInput";
import { useSession } from "@/lib/session/SessionContext";
import { useAuthPage } from "@/lib/auth/useAuthPage";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export default function OwnerSignupPage() {
  const router = useRouter();
  const { signUpOwner } = useSession();
  const { urlError } = useAuthPage();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<React.ReactNode>(null);
  const [confirmSentTo, setConfirmSentTo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Enter a valid email address");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setLoading(true);
    const result = await signUpOwner(trimmed, password);
    setLoading(false);
    if (!result.ok) {
      if (result.code === "already_registered") {
        setFormError(
          <>
            An account with this email already exists. <Link href="/owner/login">Log in</Link> or{" "}
            <Link href="/owner/forgot-password">reset your password</Link>.
          </>,
        );
      } else if (result.code === "weak_password") setPasswordError(result.message ?? "Choose a stronger password");
      else setFormError(result.message ?? "Could not create the account");
      return;
    }
    if (result.code === "confirm_email") {
      setConfirmSentTo(trimmed);
      return;
    }
    router.push("/owner/register");
  }

  if (confirmSentTo) {
    return (
      <main className="bq-auth-bg">
        <div className="bq-auth-card">
          <div className="bq-auth-brand">
            Boutiqo
          </div>
          <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Check your email</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
            We sent a confirmation link to <strong>{confirmSentTo}</strong>. Open it to continue setting up your boutique.
          </p>
          <Button variant="secondary" block onClick={() => setConfirmSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Create your account</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Use your Gmail address to get started.</p>
        {urlError || formError ? (
          <div role="alert" className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            {formError ?? urlError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input
            label="Email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError ?? undefined}
          />
          <PasswordInput
            label="Password"
            required
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError ?? undefined}
          />
          <Button type="submit" block disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: "var(--text-faint)", fontSize: 15 }}>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
          or
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
        </div>
        <GoogleButton />
        <p style={{ marginTop: 18, fontSize: 16 }}>
          Already have an account? <Link href="/owner/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
