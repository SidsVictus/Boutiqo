"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { Card } from "@/components/ds/Card";
import { Input } from "@/components/ds/Input";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/Badge";

export default function OwnerSettingsPage() {
  const { session } = useSession();
  const boutique = session?.kind === "owner" ? session.boutique : null;
  if (!boutique) return null;

  const statusTone = boutique.status === "active" ? "success" : boutique.status === "on_hold" ? "warning" : "neutral";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      <Card title="Boutique" action={<Badge tone={statusTone}>{boutique.status.replace("_", " ")}</Badge>}>
        <div className="bq-g2" style={{ marginTop: 8 }}>
          <Input label="Boutique name" defaultValue={boutique.name} readOnly />
          <Input label="Owner name" defaultValue={boutique.owner_name} readOnly />
          <Input label="Area" defaultValue={boutique.area ?? ""} readOnly />
          <Input label="Category" defaultValue={boutique.category} readOnly />
          <Input label="Phone" defaultValue={boutique.phone ?? ""} readOnly />
          <Input label="GST number" defaultValue={boutique.gst_number ?? "—"} readOnly />
        </div>
      </Card>
      <Card title="Account">
        <Input label="Email" defaultValue={boutique.email} readOnly />
      </Card>
      <Button variant="secondary" disabled>
        Edit details (not wired up in this preview)
      </Button>
    </div>
  );
}
