"use client";

import * as React from "react";
import { useSession } from "@/lib/session/SessionContext";
import { listAdmins, setAdminActive, ADMIN_ROLE_SCOPE } from "@/lib/data/admins";
import { Switch } from "@/components/ds/Switch";
import { Badge } from "@/components/ds/Badge";
import { useToast } from "@/lib/session/ToastContext";
import type { AdminUser } from "@/lib/supabase/types";

export default function AdminRolesPage() {
  const { session } = useSession();
  const { flash } = useToast();
  const me = session?.kind === "admin" ? session.admin : null;
  const [admins, setAdmins] = React.useState<AdminUser[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    listAdmins().then(setAdmins);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!me) return null;

  async function toggle(admin: AdminUser) {
    setError(null);
    try {
      await setAdminActive(admin.id, !admin.active, me!.role);
      flash(`${admin.name} ${admin.active ? "suspended" : "reactivated"}.`, "success");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this admin.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
      {error ? <div className="bq-field__error">{error}</div> : null}
      {admins.map((a) => (
        <div key={a.id} className="bq-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{a.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {a.role.replace("_", " ")} · {ADMIN_ROLE_SCOPE[a.role]}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!a.active ? <Badge tone="neutral">Suspended</Badge> : null}
            <Switch checked={a.active} onChange={() => toggle(a)} disabled={me.role !== "owner_admin"} label="Active" />
          </div>
        </div>
      ))}
    </div>
  );
}
