import type { Customer } from "@/lib/supabase/types";
import { customers, orders, simulate, uid } from "./store";

export async function listCustomers(boutiqueId: string, search?: string): Promise<Customer[]> {
  return simulate(() => {
    let rows = customers.filter((c) => c.boutique_id === boutiqueId);
    if (search) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")));
    }
    return rows;
  });
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return simulate(() => customers.find((c) => c.id === id) ?? null);
}

export function customerOrders(customerId: string) {
  return orders.filter((o) => o.customer_id === customerId);
}

export interface CreateCustomerInput {
  boutiqueId: string;
  name: string;
  phone?: string;
  address?: string;
  instagramHandle?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return simulate(() => {
    const row: Customer = {
      id: uid("c"),
      boutique_id: input.boutiqueId,
      name: input.name,
      phone: input.phone || null,
      address: input.address || null,
      instagram_handle: input.instagramHandle || null,
      customer_since: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    customers.push(row);
    return row;
  });
}
