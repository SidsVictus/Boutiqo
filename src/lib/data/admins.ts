import type { AdminUser } from "@/lib/supabase/types";
import { admins, simulate } from "./store";
import { MockApiError } from "./store";

export async function listAdmins(): Promise<AdminUser[]> {
  return simulate(() => [...admins]);
}

export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  return simulate(() => admins.find((a) => a.email.toLowerCase() === email.toLowerCase()) ?? null);
}

/** Suspend/reactivate — mirrors admins_update RLS (owner_admin only). */
export async function setAdminActive(adminId: string, active: boolean, actingAdminRole: string): Promise<AdminUser> {
  return simulate(() => {
    if (actingAdminRole !== "owner_admin") {
      throw new MockApiError("forbidden", "Only an owner admin can suspend or reactivate admins");
    }
    const admin = admins.find((a) => a.id === adminId);
    if (!admin) throw new MockApiError("not_found", "Admin not found");
    admin.active = active;
    admin.updated_at = new Date().toISOString();
    return admin;
  });
}

export const ADMIN_ROLE_SCOPE: Record<AdminUser["role"], string> = {
  owner_admin: "Full access, billing, admin roles",
  support_admin: "View boutiques, hold and activate accounts",
  billing_admin: "Plans and invoices only",
  viewer: "Read only, no edits",
};
