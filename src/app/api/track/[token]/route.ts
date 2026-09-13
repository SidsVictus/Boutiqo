import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { presignDownloadUrl } from "@/lib/r2";
import { apiNotFound, apiOk } from "@/lib/api-response";

interface OrderTrackingRow {
  order_code: string;
  garment_type: string;
  stage: string;
  effective_stage: string;
  due_date: string;
  total_amount: number;
  advance_amount: number;
  balance_amount: number;
  paid: boolean;
  boutique_name: string;
  boutique_phone: string | null;
  cloth_object_key: string | null;
}

// No-login customer tracking page (§8). Deliberately NOT a broad "anon can SELECT
// orders" RLS policy — this calls the tightly-scoped get_order_tracking() RPC
// (SECURITY DEFINER, returns only the safe columns) and, only here in the trusted
// server, turns the returned object key into a short-lived presigned URL. The raw
// key is never sent to the browser. A wrong/unknown token gets exactly the same
// generic 404 as any other miss — never a distinguishing error.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!/^[0-9a-f]{64}$/i.test(token)) return apiNotFound("Tracking link not found");

  const anon = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });

  const { data, error } = await anon
    .rpc("get_order_tracking", { p_token: token })
    .maybeSingle<OrderTrackingRow>();

  if (error || !data) return apiNotFound("Tracking link not found");

  const clothPhotoUrl = data.cloth_object_key ? await presignDownloadUrl(data.cloth_object_key) : null;

  return apiOk({
    orderCode: data.order_code,
    garmentType: data.garment_type,
    stage: data.effective_stage,
    dueDate: data.due_date,
    totalAmount: data.total_amount,
    advanceAmount: data.advance_amount,
    balanceAmount: data.balance_amount,
    paid: data.paid,
    boutiqueName: data.boutique_name,
    boutiquePhone: data.boutique_phone,
    clothPhotoUrl,
  });
}
