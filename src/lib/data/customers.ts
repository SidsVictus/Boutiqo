import type { Customer, Order } from "@/lib/supabase/types";
import { db, apiFetch } from "./supabaseClient";
import { ApiError } from "./store";

export async function listCustomers(boutiqueId: string, search?: string): Promise<Customer[]> {
  void boutiqueId; // the real route scopes to the caller's own boutique via RLS, not a param.
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const qs = params.toString();
  return apiFetch<Customer[]>(`/api/customers${qs ? `?${qs}` : ""}`);
}

export async function getCustomer(id: string): Promise<Customer | null> {
  // No dedicated GET-by-id route exists in Phase 1 — read directly via the
  // RLS-scoped browser client instead (documented in docs/phase3-report.md).
  const { data, error } = await db().from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError("query_failed", "Could not load this customer");
  return data as Customer | null;
}

/** Phase 3: now async (was a synchronous in-memory lookup against the Phase 2
 * mock array) — a real lookup needs a network round trip. Documented
 * signature change; its one call site (owner/customers/[id]/page.tsx) has
 * been updated to await it. */
export async function customerOrders(customerId: string): Promise<Order[]> {
  const { data, error } = await db().from("orders").select("*").eq("customer_id", customerId).order("due_date", { ascending: true });
  if (error) throw new ApiError("query_failed", "Could not load this customer's orders");
  return data as Order[];
}

export interface CreateCustomerInput {
  boutiqueId: string; // unused — the real route derives the boutique from the session.
  name: string;
  phone?: string;
  address?: string;
  instagramHandle?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return apiFetch<Customer>("/api/customers", {
    method: "POST",
    body: JSON.stringify({ name: input.name, phone: input.phone, address: input.address, instagramHandle: input.instagramHandle }),
  });
}
