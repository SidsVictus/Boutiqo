import type { Order, OrderStage } from "@/lib/supabase/types";
import { MEASUREMENT_FIELDS } from "@/lib/supabase/types";
import { db, apiFetch } from "./supabaseClient";
import { ApiError } from "./store";

export async function listOrders(boutiqueId: string, stage?: OrderStage): Promise<Order[]> {
  void boutiqueId; // real route scopes to the caller's boutique via RLS.
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  const qs = params.toString();
  return apiFetch<Order[]>(`/api/orders${qs ? `?${qs}` : ""}`);
}

export async function getOrder(id: string): Promise<Order | null> {
  // No dedicated GET-by-id route — read directly via the RLS-scoped client.
  const { data, error } = await db().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError("query_failed", "Could not load this order");
  return data as Order | null;
}

export interface CreateOrderInput {
  boutiqueId: string; // unused — real route derives the boutique from the session.
  customerId: string;
  garmentType: string;
  garmentTypeOther?: string;
  dueDate: string;
  totalAmount: number;
  advanceAmount: number;
  tailorName?: string;
  clothDescription?: string;
  styleNotes?: string;
  measurements?: Partial<Record<(typeof MEASUREMENT_FIELDS)[number], number | null>>;
}

/** Mirrors POST /api/orders. */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return apiFetch<Order>("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customerId: input.customerId,
      garmentType: input.garmentType,
      garmentTypeOther: input.garmentTypeOther,
      dueDate: input.dueDate,
      totalAmount: input.totalAmount,
      advanceAmount: input.advanceAmount,
      tailorName: input.tailorName,
      clothDescription: input.clothDescription,
      styleNotes: input.styleNotes,
      measurements: input.measurements,
    }),
  });
}

export async function updateOrderStage(orderId: string, stage: OrderStage): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${orderId}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
}

export async function markOrderPaid(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${orderId}/mark-paid`, { method: "POST" });
}

/** Attaches an already-uploaded file to an order. Phase 1 doesn't expose this
 * as its own route — POST /api/uploads/confirm already does it as part of
 * confirming the upload (it sets orders.cloth_photo_file_id). This wrapper
 * exists only so callers that think in terms of "attach a photo to an order"
 * don't need to know that confirm-upload is where it actually happens. */
export async function attachClothPhoto(orderId: string, fileId: string): Promise<Order> {
  void orderId; // confirm-upload derives the order from the file row itself.
  const { confirmUpload } = await import("./uploads");
  await confirmUpload(fileId);
  const order = await getOrder(orderId);
  if (!order) throw new ApiError("not_found", "Order not found");
  return order;
}
