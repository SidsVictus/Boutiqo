import type { EffectiveOrderStage } from "@/lib/supabase/types";

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

/**
 * Real GET /api/track/:token — no Supabase client/session involved at all
 * (this is the anonymous customer path). A wrong/unknown token resolves to
 * `null`, matching the route's generic 404 (never a distinguishing error).
 * Called with no credentials — this is intentionally the one data-layer
 * function that must work with zero auth state.
 */
export async function getOrderTracking(token: string): Promise<TrackingView | null> {
  const res = await fetch(`/api/track/${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return (body?.data as TrackingView) ?? null;
}
