"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { PasswordInput } from "@/components/app/PasswordInput";
import { GoogleButton } from "@/components/app/GoogleButton";
import { useSession } from "@/lib/session/SessionContext";
import { useAuthPage } from "@/lib/auth/useAuthPage";

export default function OwnerLoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const { urlError } = useAuthPage();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      if (result.code === "account_disabled" || result.code === "account_suspended" || result.code === "email_not_confirmed") setNotice(result.message ?? null);
      else setError(result.message ?? "Incorrect email or password");
      return;
    }
    // Same form for everyone; where you land is decided by who you turn out
    // to be, after authentication.
    if (result.code === "admin") router.push("/admin/dashboard");
    else if (result.code === "registration_incomplete") router.push("/owner/register");
    else router.push("/owner/dashboard");
  }

  const banner = notice ?? urlError;

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        <h1 className="bq-auth-title">Log in</h1>
        <p className="bq-auth-sub">Welcome back.</p>

        {banner ? (
          <div role="alert" className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            {banner}
          </div>
        ) : null}

        <GoogleButton />
        <div className="bq-or">or with email</div>
        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          <div style={{ marginTop: -6, textAlign: "right", fontSize: 16 }}>
            <Link href="/owner/forgot-password">Forgot password?</Link>
          </div>
          <Button type="submit" block disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="bq-auth-foot">
          New here? <Link href="/owner/signup">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
