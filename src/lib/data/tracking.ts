import { boutiques, files, orders, simulate } from "./store";
import { balance, effectiveStage } from "@/lib/calc/order";
import type { EffectiveOrderStage } from "@/lib/supabase/types";

/** Mirrors the shape GET /api/track/:token returns — a safe subset only,
 * exactly matching Phase 1's get_order_tracking() RPC columns. */
export interface TrackingView {
  orderCode: string;
  garmentType: string;
  stage: EffectiveOrderStage;
  dueDate: string;
  totalAmount: number;
  advanceAmount: number;
  balanceAmount: number;
  paid: boolean;
  boutiqueName: string;
  boutiquePhone: string | null;
  clothPhotoUrl: string | null;
}

/** A wrong/unknown token resolves to null — the route layer turns that into a
 * generic 404, never a distinguishing error (see Phase 1 §8). */
export async function getOrderTracking(token: string): Promise<TrackingView | null> {
  return simulate(
    () => {
      const order = orders.find((o) => o.tracking_token === token);
      if (!order) return null;
      const boutique = boutiques.find((b) => b.id === order.boutique_id);
      if (!boutique) return null;
      const file = order.cloth_photo_file_id ? files.find((f) => f.id === order.cloth_photo_file_id) : null;
      return {
        orderCode: order.order_code,
        garmentType: order.garment_type === "Other" ? order.garment_type_other || "Other" : order.garment_type,
        stage: effectiveStage(order.stage, order.due_date),
        dueDate: order.due_date,
        totalAmount: order.total_amount,
        advanceAmount: order.advance_amount,
        balanceAmount: balance(order.total_amount, order.advance_amount),
        paid: order.paid,
        boutiqueName: boutique.name,
        boutiquePhone: boutique.phone,
        // Mock stand-in for a presigned R2 URL — see docs/phase2-report.md for
        // the expired/missing-file states this seam needs to preserve.
        clothPhotoUrl: file && file.upload_status === "uploaded" ? `/assets/measure-front.png` : null,
      };
    },
    { latencyMs: 260 },
  );
}
