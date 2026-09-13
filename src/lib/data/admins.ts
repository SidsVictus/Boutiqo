import type { AdminUser } from "@/lib/supabase/types";
import { db, apiFetch } from "./supabaseClient";
import { ApiError } from "./store";

export async function listAdmins(): Promise<AdminUser[]> {
  const { data, error } = await db().from("admins").select("*").order("name", { ascending: true });
  if (error) throw new ApiError("query_failed", "Could not load admins");
  return data as AdminUser[];
}

export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  const { data, error } = await db().from("admins").select("*").ilike("email", email).maybeSingle();
  if (error) throw new ApiError("query_failed", "Could not look up this admin");
  return data as AdminUser | null;
}

/** `actingAdminRole` no longer needed by this function — the real
 * `admins_update` RLS policy enforces owner_admin-only server-side. Kept for
 * call-site compatibility with Phase 2's signature. */
export async function setAdminActive(adminId: string, active: boolean, _actingAdminRole?: string): Promise<AdminUser> {
  void _actingAdminRole;
  return apiFetch<AdminUser>(`/api/admin/admins/${adminId}/active`, { method: "POST", body: JSON.stringify({ active }) });
}

export const ADMIN_ROLE_SCOPE: Record<AdminUser["role"], string> = {
  owner_admin: "Full access, billing, admin roles",
  support_admin: "View boutiques, hold and activate accounts",
  billing_admin: "Plans and invoices only",
  viewer: "Read only, no edits",
};
