"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/lib/session/SessionContext";

export default function OwnerSignupPage() {
  const router = useRouter();
  const { signUpOwner, signInWithGoogle } = useSession();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter an email and password");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await signUpOwner(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Could not create the account");
      return;
    }
    router.push("/owner/register");
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card">
        <div className="bq-auth-brand">
          <Logo size={30} />
          boutiqo
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Create your account</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>Use your Gmail address to get started.</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Email" type="email" required placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" required placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          <Button type="submit" block disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: "var(--text-faint)", fontSize: 13 }}>
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
          or
          <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-hairline)" }} />
        </div>
        <Button variant="secondary" block onClick={() => void signInWithGoogle()}>
          Continue with Google
        </Button>
        <p style={{ marginTop: 18, fontSize: 14 }}>
          Already have an account? <a href="/owner/login">Log in</a>
        </p>
      </div>
    </main>
  );
}
