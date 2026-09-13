import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { orderStageUpdateSchema } from "@/lib/validation/order";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

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

  if (error) return apiError(403, "update_failed", "Could not update the order stage");
  return apiOk(data);
}
