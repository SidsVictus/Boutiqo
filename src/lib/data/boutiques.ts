import type { Boutique, BoutiqueStatus } from "@/lib/supabase/types";
import { boutiques, simulate, uid } from "./store";

/** Mirrors GET/PATCH shapes of the Phase 1 boutiques-related routes. */

export async function listBoutiques(search?: string): Promise<Boutique[]> {
  return simulate(() => {
    if (!search) return [...boutiques];
    const q = search.trim().toLowerCase();
    return boutiques.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.area ?? "").toLowerCase().includes(q) || b.owner_name.toLowerCase().includes(q),
    );
  });
}

export async function getBoutique(id: string): Promise<Boutique | null> {
  return simulate(() => boutiques.find((b) => b.id === id) ?? null);
}

export async function getBoutiqueByOwnerUserId(ownerUserId: string): Promise<Boutique | null> {
  return simulate(() => boutiques.find((b) => b.owner_user_id === ownerUserId) ?? null);
}

export interface RegisterBoutiqueInput {
  ownerUserId: string;
  name: string;
  area?: string;
  ownerName: string;
  email: string;
  phone?: string;
  gstNumber?: string;
  category: string;
}

/** Owner self-registration (owner-register screen), post-signup. */
export async function registerBoutique(input: RegisterBoutiqueInput): Promise<Boutique> {
  return simulate(() => {
    const row: Boutique = {
      id: uid("b"),
      owner_user_id: input.ownerUserId,
      name: input.name,
      area: input.area ?? null,
      owner_name: input.ownerName,
      email: input.email,
      phone: input.phone ?? null,
      gst_number: input.gstNumber ?? null,
      category: input.category,
      status: "active",
      terms_tnc_accepted: false,
      terms_privacy_accepted: false,
      terms_accepted_at: null,
      order_seq: 0,
      logo_file_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    boutiques.push(row);
    return row;
  });
}

export async function acceptTerms(boutiqueId: string): Promise<Boutique> {
  return simulate(() => {
    const b = boutiques.find((x) => x.id === boutiqueId);
    if (!b) throw new Error("Boutique not found");
    b.terms_tnc_accepted = true;
    b.terms_privacy_accepted = true;
    b.terms_accepted_at = new Date().toISOString();
    b.updated_at = new Date().toISOString();
    return b;
  });
}

/** admin-add: Super Admin creates a tenant directly. */
export async function adminCreateBoutique(input: RegisterBoutiqueInput): Promise<Boutique> {
  return registerBoutique(input);
}

/** admin-access: hold / disable / activate. RLS + trigger enforcement of WHICH
 * admin sub-role may make WHICH transition happens for real only in Phase 1's
 * backend — this mock applies the same matrix so the UI can be built/tested
 * against the correct allow/deny behavior now. See docs/decisions.md #3. */
export async function setBoutiqueStatus(boutiqueId: string, status: BoutiqueStatus, actingAdminRole: string): Promise<Boutique> {
  return simulate(() => {
    const b = boutiques.find((x) => x.id === boutiqueId);
    if (!b) throw new Error("Boutique not found");
    if (actingAdminRole === "viewer" || actingAdminRole === "billing_admin") {
      throw new Error(`${actingAdminRole.replace("_", " ")} admins cannot change boutique status`);
    }
    if (actingAdminRole === "support_admin" && status === "disabled") {
      throw new Error("Support admins cannot disable a boutique");
    }
    b.status = status;
    b.updated_at = new Date().toISOString();
    return b;
  });
}
