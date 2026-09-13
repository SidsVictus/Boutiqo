"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";
import { getBoutique, setBoutiqueStatus } from "@/lib/data/boutiques";
import { Card } from "@/components/ds/Card";
import { Badge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { useToast } from "@/lib/session/ToastContext";
import type { Boutique, BoutiqueStatus } from "@/lib/supabase/types";

const STATUS_TONE: Record<Boutique["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  on_hold: "warning",
  disabled: "neutral",
};

export default function AdminAccessPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { flash } = useToast();
  const admin = session?.kind === "admin" ? session.admin : null;
  const [boutique, setBoutique] = React.useState<Boutique | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getBoutique(id).then(setBoutique);
  }, [id]);

  if (!admin || !boutique) return <div className="bq-skeleton" style={{ height: 160 }} />;

  async function transition(status: BoutiqueStatus) {
    setError(null);
    try {
      const updated = await setBoutiqueStatus(boutique!.id, status, admin!.role);
      setBoutique(updated);
      flash(`${updated.name} is now ${updated.status.replace("_", " ")}.`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this boutique.");
    }
  }

  const isBillingOrViewer = admin.role === "billing_admin" || admin.role === "viewer";
  const canDisable = admin.role === "owner_admin";

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
      <Card title={boutique.name} action={<Badge tone={STATUS_TONE[boutique.status]}>{boutique.status.replace("_", " ")}</Badge>} />
      {error ? <div className="bq-field__error">{error}</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Button variant="secondary" disabled={isBillingOrViewer || boutique.status === "on_hold"} onClick={() => transition("on_hold")} title={isBillingOrViewer ? "Your role cannot change boutique status" : undefined}>
          Put on hold
        </Button>
        <Button variant="secondary" disabled={isBillingOrViewer || boutique.status === "active"} onClick={() => transition("active")} title={isBillingOrViewer ? "Your role cannot change boutique status" : undefined}>
          Activate
        </Button>
        <Button variant="danger" disabled={!canDisable || boutique.status === "disabled"} onClick={() => transition("disabled")} title={!canDisable ? "Only an owner admin can disable a boutique" : undefined}>
          Disable
        </Button>
      </div>
    </div>
  );
}
