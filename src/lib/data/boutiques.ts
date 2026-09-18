import type { Boutique, BoutiqueStatus } from "@/lib/supabase/types";
import { db, apiFetch } from "./supabaseClient";
import { ApiError } from "./store";

/**
 * Phase 3: real implementation. Reads go through the browser Supabase client
 * (RLS-scoped to the signed-in user); the two writes that need the
 * service-role key (registration, admin-add) go through Phase 1's API routes.
 */

export async function listBoutiques(search?: string): Promise<Boutique[]> {
  let query = db().from("boutiques").select("*").order("created_at", { ascending: false });
  if (search) {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,area.ilike.%${q}%,owner_name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw new ApiError("query_failed", "Could not load boutiques");
  return data as Boutique[];
}

export async function getBoutique(id: string): Promise<Boutique | null> {
  const { data, error } = await db().from("boutiques").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError("query_failed", "Could not load this boutique");
  return data as Boutique | null;
}

export async function getBoutiqueByOwnerUserId(ownerUserId: string): Promise<Boutique | null> {
  const { data, error } = await db().from("boutiques").select("*").eq("owner_user_id", ownerUserId).maybeSingle();
  if (error) throw new ApiError("query_failed", "Could not load this account's boutique");
  return data as Boutique | null;
}

export interface RegisterBoutiqueInput {
  ownerUserId: string; // unused in the real implementation (the server derives it from the session) — kept for call-site compatibility.
  name: string;
  area?: string;
  ownerName: string;
  email: string; // unused — the server uses the authenticated user's own email.
  phone?: string;
  gstNumber?: string;
  category: string;
  /** Phase 3 addition: Phase 1's real POST /api/auth/register combines
   * registration + terms acceptance into ONE request (see docs/phase3-report.md
   * "Documented mismatch: registration vs. terms as two screens"). Required
   * for the real call; the owner-terms screen supplies this. */
  terms?: { tnc: boolean; privacy: boolean };
}

/** Owner self-registration (owner-register + owner-terms screens, combined
 * into one request to match the real POST /api/auth/register contract). */
export async function registerBoutique(input: RegisterBoutiqueInput): Promise<Boutique> {
  if (!input.terms?.tnc || !input.terms?.privacy) {
    throw new ApiError("validation_failed", "Both terms must be accepted before registering");
  }
  return apiFetch<Boutique>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      area: input.area,
      ownerName: input.ownerName,
      phone: input.phone,
      gstNumber: input.gstNumber,
      category: input.category,
      terms: input.terms,
    }),
  });
}

/** No-op against the real backend: terms are accepted as part of
 * `registerBoutique` now (see above). Kept so any remaining call site doesn't
 * need to change — it just re-fetches the (already-accepted) boutique. */
export async function acceptTerms(boutiqueId: string): Promise<Boutique> {
  const boutique = await getBoutique(boutiqueId);
  if (!boutique) throw new ApiError("not_found", "Boutique not found");
  return boutique;
}

/** admin-add: Super Admin creates a tenant + its owner's auth user directly. */
export async function adminCreateBoutique(input: RegisterBoutiqueInput & { ownerEmail?: string }): Promise<Boutique> {
  return apiFetch<Boutique>("/api/admin/boutiques", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      area: input.area,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail ?? input.email,
      phone: input.phone,
      gstNumber: input.gstNumber,
      category: input.category,
    }),
  });
}

/** admin-access: hold / disable / activate. `actingAdminRole` is no longer
 * needed by this function (the real RLS + trigger enforce the sub-role matrix
 * server-side, per docs/decisions.md #3) — kept as an unused parameter only
 * for call-site compatibility with Phase 2's signature. */
export async function setBoutiqueStatus(boutiqueId: string, status: BoutiqueStatus, _actingAdminRole?: string): Promise<Boutique> {
  void _actingAdminRole;
  return apiFetch<Boutique>(`/api/admin/boutiques/${boutiqueId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
