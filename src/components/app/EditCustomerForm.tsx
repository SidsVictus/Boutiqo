"use client";

import * as React from "react";
import { Input } from "@/components/ds/Input";
import { Button } from "@/components/ds/Button";
import { ApiError } from "@/lib/data/store";
import { updateCustomer } from "@/lib/data/customers";
import { customerUpdateSchema } from "@/lib/validation/customer";
import { useToast } from "@/lib/session/ToastContext";
import type { Customer } from "@/lib/supabase/types";

type Field = "name" | "phone" | "address" | "instagramHandle";

/** Edits a customer's name, phone, address and Instagram handle. Validated here
 * with the same rules the PATCH route enforces. */
export function EditCustomerForm({ customer, onSaved, onCancel }: { customer: Customer; onSaved: (customer: Customer) => void; onCancel: () => void }) {
  const { flash } = useToast();
  const [form, setForm] = React.useState({
    name: customer.name,
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    instagramHandle: customer.instagram_handle ?? "",
  });
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = customerUpdateSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const updated = await updateCustomer(customer.id, parsed.data);
      flash(`${updated.name} updated.`, "success");
      onSaved(updated);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save this customer. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
      <Input label="Name" required value={form.name} onChange={set("name")} error={errors.name} />
      <Input label="Phone" inputMode="tel" value={form.phone} onChange={set("phone")} error={errors.phone} />
      <Input label="Address" multiline value={form.address} onChange={set("address")} error={errors.address} />
      <Input label="Instagram" hint="Optional" value={form.instagramHandle} onChange={set("instagramHandle")} error={errors.instagramHandle} />
      {formError ? <div className="bq-field__error">{formError}</div> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
