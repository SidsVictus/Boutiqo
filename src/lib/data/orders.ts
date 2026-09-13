import type { Order, OrderStage } from "@/lib/supabase/types";
import { MEASUREMENT_FIELDS } from "@/lib/supabase/types";
import { boutiques, orders, simulate, uid } from "./store";
import { MockApiError } from "./store";

export async function listOrders(boutiqueId: string, stage?: OrderStage): Promise<Order[]> {
  return simulate(() => {
    let rows = orders.filter((o) => o.boutique_id === boutiqueId);
    if (stage) rows = rows.filter((o) => o.stage === stage);
    return [...rows].sort((a, b) => a.due_date.localeCompare(b.due_date));
  });
}

export async function getOrder(id: string): Promise<Order | null> {
  return simulate(() => orders.find((o) => o.id === id) ?? null);
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CreateOrderInput {
  boutiqueId: string;
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
  clothPhotoFileId?: string | null;
}

/** Mirrors POST /api/orders. Enforces the same business rule Phase 1's RLS
 * does: a new order can only be created while the boutique is "active" — see
 * docs/decisions.md #3 (on_hold blocks NEW orders only). */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return simulate(() => {
    const boutique = boutiques.find((b) => b.id === input.boutiqueId);
    if (!boutique) throw new MockApiError("not_found", "Boutique not found");
    if (boutique.status !== "active") {
      throw new MockApiError(
        "forbidden",
        boutique.status === "on_hold"
          ? "This boutique is on hold. New orders are paused until it's reactivated."
          : "This boutique is disabled. Contact Boutiqo support.",
      );
    }
    if (input.advanceAmount > input.totalAmount) {
      throw new MockApiError("validation_failed", "Advance cannot exceed the total amount");
    }

    boutique.order_seq += 1;
    const code = `BQ-${String(boutique.order_seq).padStart(4, "0")}`;

    const measurementDefaults = Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, null]));

    const row: Order = {
      id: uid("o"),
      boutique_id: input.boutiqueId,
      customer_id: input.customerId,
      order_code: code,
      garment_type: input.garmentType,
      garment_type_other: input.garmentType === "Other" ? input.garmentTypeOther ?? null : null,
      stage: "received",
      due_date: input.dueDate,
      total_amount: input.totalAmount,
      advance_amount: input.advanceAmount,
      paid: false,
      tailor_name: input.tailorName || null,
      cloth_description: input.clothDescription || null,
      style_notes: input.styleNotes || null,
      cloth_photo_file_id: input.clothPhotoFileId ?? null,
      tracking_token: randomToken(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...measurementDefaults,
      ...input.measurements,
    } as Order;
    orders.push(row);
    return row;
  });
}

/** Mirrors POST /api/orders/:id/stage. */
export async function updateOrderStage(orderId: string, stage: OrderStage): Promise<Order> {
  return simulate(() => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new MockApiError("not_found", "Order not found");
    order.stage = stage;
    order.updated_at = new Date().toISOString();
    return order;
  });
}

/** Mirrors POST /api/orders/:id/mark-paid. Sets advance = total, paid = true.
 * No reverse action — mirrors the real route exactly. */
export async function markOrderPaid(orderId: string): Promise<Order> {
  return simulate(() => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new MockApiError("not_found", "Order not found");
    if (order.paid) return order;
    order.advance_amount = order.total_amount;
    order.paid = true;
    order.updated_at = new Date().toISOString();
    return order;
  });
}

export async function attachClothPhoto(orderId: string, fileId: string): Promise<Order> {
  return simulate(() => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new MockApiError("not_found", "Order not found");
    order.cloth_photo_file_id = fileId;
    order.updated_at = new Date().toISOString();
    return order;
  });
}
