import { z } from "zod";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { customerUpdateSchema } from "@/lib/validation/customer";
import { apiError, apiNotFound, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

// Edits only the fields sent. The update runs through the caller's own
// RLS-scoped client (customers_update), so another boutique's customer matches
// no row and answers 404, exactly like an id that doesn't exist.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiNotFound("Customer not found");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return apiError(400, "invalid_body", "Request body must be a JSON object");

  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { name, phone, address, instagramHandle } = parsed.data;
  const patch: Record<string, string | null> = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone = phone || null;
  if (address !== undefined) patch.address = address || null;
  if (instagramHandle !== undefined) patch.instagram_handle = instagramHandle || null;
  if (Object.keys(patch).length === 0) return apiError(400, "nothing_to_update", "Send at least one field to change");

  const { data, error } = await supabase.from("customers").update(patch).eq("id", id).select();
  if (error) return apiError(403, "update_failed", "Could not update the customer");
  if (!data || data.length === 0) return apiNotFound("Customer not found");
  return apiOk(data[0]);
}
