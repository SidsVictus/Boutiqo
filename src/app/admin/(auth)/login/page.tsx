"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { Logo } from "@/components/app/Logo";
import { useSession, FIXTURE_LOGIN_PASSWORD } from "@/lib/session/SessionContext";

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
      else setError(result.message);
      return;
    }
    router.push("/admin/dashboard");
  }

  function fillDemo() {
    setEmail("admin.owner@example-fixture.test");
    setPassword(FIXTURE_LOGIN_PASSWORD);
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          <Logo size={30} />
          boutiqo admin
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Super admin login</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Internal Boutiqo team only.</p>

        {suspendedNotice ? (
          <div className="bq-card" style={{ background: "var(--danger-bg)", color: "var(--signal-700)", marginBottom: 16 }}>
            This admin account has been suspended.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          <Button type="submit" block disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <button type="button" onClick={fillDemo} style={{ marginTop: 14, background: "none", border: 0, color: "var(--text-link)", fontSize: 13, cursor: "pointer", padding: 0 }}>
          Fill demo owner-admin credentials
        </button>
      </div>
    </main>
  );
}
