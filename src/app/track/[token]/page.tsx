"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { getOrderTracking, type TrackingView } from "@/lib/data/tracking";
import { TrackingProgress } from "@/components/app/TrackingProgress";
import { RemoteImage } from "@/components/app/ClothPhotoUpload";
import { Button } from "@/components/ds/Button";
import { Logo } from "@/components/app/Logo";
import { Send } from "@/components/app/icons";
import { formatMoney, formatShortDate } from "@/lib/calc/format";
import { STAGES } from "@/components/ds/StageBadge";

/** No login, no nav chrome, reachable only via the tracking-token URL — per
 * the handoff, this page is deliberately isolated from the rest of the app. */
export default function CustomerTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = React.useState<TrackingView | null | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    getOrderTracking(token).then((v) => !cancelled && setView(v));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="bq-auth-bg" style={{ alignItems: "flex-start", paddingTop: 40 }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div className="bq-auth-brand" style={{ justifyContent: "center" }}>
          <Logo size={28} />
          boutiqo
        </div>

        {view === undefined ? (
          <div className="bq-auth-card">
            <div className="bq-skeleton" style={{ height: 200 }} />
          </div>
        ) : view === null ? (
          <div className="bq-auth-card" style={{ textAlign: "center" }}>
            <h1 className="bq-brand" style={{ fontSize: 22 }}>
              Tracking link not found
            </h1>
            <p style={{ color: "var(--text-muted)" }}>This link may be incorrect or the order may no longer be trackable.</p>
          </div>
        ) : (
          <div className="bq-auth-card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="bq-num" style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {view.orderCode}
                </div>
                <h1 style={{ margin: 0, fontSize: 20 }}>{view.garmentType}</h1>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="bq-label">Delivery</div>
                <div className="bq-num">{formatShortDate(view.dueDate)}</div>
              </div>
            </div>

            <TrackingProgress stage={view.stage} />
            <p style={{ textAlign: "center", fontWeight: 600, color: view.stage === "overdue" ? "var(--signal-600)" : "var(--text-strong)" }}>
              {view.stage === "overdue" ? "This order is overdue." : `Your order is at: ${STAGES[view.stage]}.`}
            </p>

            <RemoteImage status={view.clothPhotoUrl ? "ready" : "missing"} src={view.clothPhotoUrl ?? undefined} />

            <div className="bq-card" style={{ background: "var(--surface-sunken)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span>Total</span>
                <span className="bq-num">{formatMoney(view.totalAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span>Advance paid</span>
                <span className="bq-num">{formatMoney(view.advanceAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Balance</span>
                <span className="bq-num" style={{ color: view.paid ? "var(--success)" : "var(--danger)" }}>
                  {view.paid ? "Paid in full" : formatMoney(view.balanceAmount)}
                </span>
              </div>
            </div>

            <Button variant="whatsapp" iconLeft={<Send size={16} />} block>
              Message {view.boutiqueName}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
