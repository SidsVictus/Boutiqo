import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { customerCreateSchema } from "@/lib/validation/customer";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

// Uses the caller's own RLS-scoped client throughout — tenant isolation is
// enforced by Postgres policy (customers_select/_insert), not by this route.
export async function GET(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();

  let query = supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return apiError(500, "query_failed", "Could not load customers");
  return apiOk(data);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "invalid_body", "Request body must be JSON");

  const parsed = customerCreateSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data: boutique } = await supabase
    .from("boutiques")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!boutique) return apiError(404, "no_boutique", "No boutique is registered for this account");

  const { name, phone, address, instagramHandle } = parsed.data;
  const { data, error } = await supabase
    .from("customers")
    .insert({
      boutique_id: boutique.id,
      name,
      phone: phone || null,
      address: address || null,
      instagram_handle: instagramHandle || null,
    })
    .select()
    .single();

  if (error) return apiError(403, "insert_failed", "Could not create the customer");
  return apiOk(data, 201);
}
