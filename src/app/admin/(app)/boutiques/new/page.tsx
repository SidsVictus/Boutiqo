"use client";

import * as React from "react";
import { ApiError } from "@/lib/data/store";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";
import { adminCreateBoutique } from "@/lib/data/boutiques";
import { Input } from "@/components/ds/Input";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/lib/session/ToastContext";

export default function AdminAddBoutiquePage() {
  const { session } = useSession();
  const router = useRouter();
  const { flash } = useToast();
  const admin = session?.kind === "admin" ? session.admin : null;
  const [form, setForm] = React.useState({ name: "", ownerName: "", email: "", area: "", category: "", phone: "", gstNumber: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  if (!admin) return null;

  const canAdd = admin.role === "owner_admin" || admin.role === "support_admin";
  if (!canAdd) {
    return (
      <div className="bq-empty">
        <div className="bq-empty__title">Not allowed</div>
        <p>{admin.role.replace("_", " ")} admins cannot add a boutique.</p>
      </div>
    );
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.ownerName || !form.email || !form.category) {
      setError("Name, owner name, email and category are required");
      return;
    }
    setLoading(true);
    try {
      const boutique = await adminCreateBoutique({
        ownerUserId: `u_admin_created_${Date.now()}`,
        name: form.name,
        ownerName: form.ownerName,
        email: form.email,
        area: form.area,
        category: form.category,
        phone: form.phone,
        gstNumber: form.gstNumber,
      });
      flash(
        boutique.welcome_email_sent
          ? `${boutique.name} added. ${boutique.email} got an email to set a password, or can sign in with Google using that address.`
          : `${boutique.name} added. The owner can sign in with Google using ${boutique.email}, or use "Forgot password?" to set a password.`,
        "success",
      );
      router.push(`/admin/boutiques/${boutique.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create this boutique. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bq-g2" style={{ maxWidth: 640, rowGap: 14 }}>
      <Input label="Boutique name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
      <Input label="Owner name" required value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
      <Input label="Owner email" required type="email" hint="The owner's own Gmail. They sign in with it on any device." value={form.email} onChange={(e) => set("email", e.target.value)} />
      <Input label="Area" value={form.area} onChange={(e) => set("area", e.target.value)} />
      <Input label="Category" required value={form.category} onChange={(e) => set("category", e.target.value)} />
      <Input label="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      <Input label="GST number" hint="Optional" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value)} />
      {error ? <div className="bq-field__error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
      <div style={{ gridColumn: "1 / -1" }}>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create boutique"}
        </Button>
      </div>
    </form>
  );
}
