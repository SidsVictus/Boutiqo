"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { Logo } from "@/components/app/Logo";
import { useSession, FIXTURE_LOGIN_PASSWORD } from "@/lib/session/SessionContext";

export default function OwnerLoginPage() {
  const router = useRouter();
  const { loginOwner } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [disabledNotice, setDisabledNotice] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDisabledNotice(false);
    const result = await loginOwner(email, password);
    setLoading(false);
    if (!result.ok) {
      if (result.code === "account_disabled") setDisabledNotice(true);
      else setError(result.message);
      return;
    }
    router.push("/owner/dashboard");
  }

  function fillDemo() {
    setEmail("owner1@example-fixture.test");
    setPassword(FIXTURE_LOGIN_PASSWORD);
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          <Logo size={30} />
          boutiqo
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Log in</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Welcome back.</p>

        {disabledNotice ? (
          <div className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            This boutique account has been disabled. Contact Boutiqo support.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          <Button type="submit" block disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <button
          type="button"
          onClick={fillDemo}
          style={{ marginTop: 14, background: "none", border: 0, color: "var(--text-link)", fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          Fill demo owner credentials (Meera Boutique, active)
        </button>
        <p style={{ marginTop: 18, fontSize: 14 }}>
          New here? <a href="/owner/signup">Create an account</a>
        </p>
      </div>
    </main>
  );
}
