import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { apiError, apiOk, apiUnauthorized } from "@/lib/api-response";

// "Mark paid" sets advance = total and paid = true. There is intentionally no
// reverse action anywhere in the design, so no "mark pending" endpoint exists.
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, total_amount, paid")
    .eq("id", orderId)
    .single();

  if (fetchError || !order) return apiError(404, "not_found", "Order not found");
  if (order.paid) return apiOk(order);

  const { data, error } = await supabase
    .from("orders")
    .update({ advance_amount: order.total_amount, paid: true })
    .eq("id", orderId)
    .select()
    .single();

  if (error) return apiError(403, "update_failed", "Could not mark the order paid");
  return apiOk(data);
}
