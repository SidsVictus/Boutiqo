"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { useToast } from "@/lib/session/ToastContext";
import { updateBoutiqueDetails } from "@/lib/data/boutiques";
import { ApiError } from "@/lib/data/store";
import { boutiqueRegistrationSchema } from "@/lib/validation/boutique";
import { Card } from "@/components/ds/Card";
import { Input } from "@/components/ds/Input";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/Badge";
import { LogOut } from "@/components/app/icons";

type Fields = { name: string; ownerName: string; area: string; category: string; phone: string; gstNumber: string };

export default function OwnerSettingsPage() {
  const { session, refreshSession } = useSession();
  const { flash } = useToast();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<Fields | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<keyof Fields, string>>>({});

  if (!boutique) return null;
  const b = boutique;

  const statusTone = b.status === "active" ? "success" : b.status === "on_hold" ? "warning" : "neutral";
  const current: Fields = form ?? {
    name: b.name,
    ownerName: b.owner_name,
    area: b.area ?? "",
    category: b.category,
    phone: b.phone ?? "",
    gstNumber: b.gst_number ?? "",
  };

  function startEditing() {
    setForm({ name: b.name, ownerName: b.owner_name, area: b.area ?? "", category: b.category, phone: b.phone ?? "", gstNumber: b.gst_number ?? "" });
    setErrors({});
    setEditing(true);
  }

  function cancel() {
    setForm(null);
    setErrors({});
    setEditing(false);
  }

  function set<K extends keyof Fields>(key: K, value: string) {
    setForm((f) => ({ ...(f ?? current), [key]: value }));
  }

  async function save() {
    // Same rules as signup's registration step and POST /api/auth/register.
    const parsed = boutiqueRegistrationSchema.safeParse(current);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Fields, string>> = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as keyof Fields] ??= issue.message;
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await updateBoutiqueDetails(b.id, {
        name: parsed.data.name,
        ownerName: parsed.data.ownerName,
        area: parsed.data.area,
        category: parsed.data.category,
        phone: parsed.data.phone,
        gstNumber: parsed.data.gstNumber,
      });
      await refreshSession();
      setEditing(false);
      setForm(null);
      flash("Boutique details saved.", "success");
    } catch (err) {
      flash(err instanceof ApiError ? err.message : "Couldn't save your changes. Try again.", "danger");
    } finally {
      setSaving(false);
    }
  }

  const ro = !editing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      <Card title="Boutique" action={<Badge tone={statusTone}>{b.status.replace("_", " ")}</Badge>}>
        <div className="bq-g2" style={{ marginTop: 8 }}>
          <Input label="Boutique name" required={editing} value={current.name} readOnly={ro} onChange={(e) => set("name", e.target.value)} error={errors.name} />
          <Input label="Owner name" required={editing} value={current.ownerName} readOnly={ro} onChange={(e) => set("ownerName", e.target.value)} error={errors.ownerName} />
          <Input label="Area" value={current.area} readOnly={ro} onChange={(e) => set("area", e.target.value)} error={errors.area} />
          <Input label="Category" required={editing} value={current.category} readOnly={ro} onChange={(e) => set("category", e.target.value)} error={errors.category} />
          <Input label="Phone" type="tel" inputMode="tel" value={current.phone} readOnly={ro} onChange={(e) => set("phone", e.target.value)} error={errors.phone} placeholder={editing ? "e.g. +91 98480 12345" : "Not added"} />
          <Input
            label="GST number"
            hint={editing ? "Optional, 15 characters" : undefined}
            value={current.gstNumber}
            readOnly={ro}
            placeholder={editing ? "" : "Not added"}
            autoCapitalize="characters"
            onChange={(e) => set("gstNumber", e.target.value.toUpperCase().replace(/\s/g, ""))}
            error={errors.gstNumber}
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {editing ? (
            <>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="secondary" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={startEditing}>
              Edit details
            </Button>
          )}
        </div>
      </Card>
      <Card title="Account">
        <Input label="Email" value={b.email} readOnly />
        <div style={{ marginTop: 16 }}>
          <Button as="a" href="/owner/signout" variant="danger" iconLeft={<LogOut size={16} />} block>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
