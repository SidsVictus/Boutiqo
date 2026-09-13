"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { Logo } from "@/components/app/Logo";
import { useSession } from "@/lib/session/SessionContext";
import { registerBoutique } from "@/lib/data/boutiques";

export default function OwnerRegisterPage() {
  const router = useRouter();
  const { draftSignup } = useSession();
  const [form, setForm] = React.useState({ name: "", area: "", category: "", gstNumber: "", phone: "", ownerName: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!draftSignup) router.replace("/owner/signup");
  }, [draftSignup, router]);

  if (!draftSignup) return null;
  const signup = draftSignup;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.ownerName || !form.category) {
      setError("Boutique name, owner name and category are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await registerBoutique({
        ownerUserId: signup.userId,
        name: form.name,
        area: form.area || undefined,
        ownerName: form.ownerName,
        email: signup.email,
        phone: form.phone || undefined,
        gstNumber: form.gstNumber || undefined,
        category: form.category,
      });
      router.push("/owner/terms");
    } catch {
      setError("Could not save your registration. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bq-auth-bg">
      <div className="bq-auth-card bq-auth-card--wide">
        <div className="bq-auth-brand">
          <Logo size={30} />
          boutiqo
        </div>
        <h1 style={{ fontSize: 21, fontFamily: "var(--font-sans)", fontWeight: 700, marginBottom: 4 }}>Tell us about your boutique</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>This appears on your records and your customers&apos; tracking pages.</p>
        <form onSubmit={handleSubmit} className="bq-g2" style={{ rowGap: 14 }}>
          <Input label="Boutique name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          <Input label="Owner name" required value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          <Input label="Area" value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Banjara Hills" />
          <Input label="Business category" required value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Ladies tailoring & boutique" />
          <Input label="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          <Input label="GST number" hint="Optional" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value)} />
          {error ? <div className="bq-field__error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
          <div style={{ gridColumn: "1 / -1" }}>
            <Button type="submit" block disabled={loading}>
              {loading ? "Saving…" : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
