"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { PasswordInput } from "@/components/app/PasswordInput";
import { GoogleButton } from "@/components/app/GoogleButton";
import { useSession } from "@/lib/session/SessionContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { loginAdmin } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [suspendedNotice, setSuspendedNotice] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuspendedNotice(false);
    const result = await loginAdmin(email, password);
    setLoading(false);
    if (!result.ok) {
      if (result.code === "account_suspended") setSuspendedNotice(true);
      else setError(result.message ?? "Incorrect email or password");
      return;
    }
    router.push("/admin/dashboard");
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          Boutiqo
        </div>
        <h1 className="bq-auth-title">Super admin login</h1>
        <p className="bq-auth-sub">Internal Boutiqo team only.</p>

        {suspendedNotice ? (
          <div className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            This admin account has been suspended.
          </div>
        ) : null}

        <GoogleButton variant="primary" />
        <div className="bq-or">or with a password</div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput label="Password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          <Button type="submit" block disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="bq-auth-foot">
          <a href="/owner/forgot-password">Forgot password?</a>
        </p>
      </div>
    </main>
  );
}
