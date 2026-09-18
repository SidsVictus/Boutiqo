import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { orderStageUpdateSchema } from "@/lib/validation/order";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  const parsed = orderStageUpdateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data, error } = await supabase
    .from("orders")
    .update({ stage: parsed.data.stage })
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    logSecurityEvent("authorization_rejected", { userId: user.id, action: "order_stage_update", orderId, attemptedStage: parsed.data.stage, reason: error.message });
    return apiError(403, "update_failed", "Could not update the order stage");
  }
  return apiOk(data);
}
