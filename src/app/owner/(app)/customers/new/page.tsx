"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";
import { createCustomer } from "@/lib/data/customers";
import { Input } from "@/components/ds/Input";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/lib/session/ToastContext";

export default function NewCustomerPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const router = useRouter();
  const { flash } = useToast();
  const [form, setForm] = React.useState({ name: "", phone: "", address: "", insta: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  if (!boutique) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    try {
      const customer = await createCustomer({ boutiqueId: boutique!.id, name: form.name, phone: form.phone, address: form.address, instagramHandle: form.insta });
      flash(`${customer.name} added.`, "success");
      router.push(`/owner/customers/${customer.id}`);
    } catch {
      setError("Could not save this customer. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
      <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={error ?? undefined} />
      <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      <Input label="Address" multiline value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      <Input label="Instagram" hint="Optional" value={form.insta} onChange={(e) => setForm((f) => ({ ...f, insta: e.target.value }))} />
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save customer"}
      </Button>
    </form>
  );
}
