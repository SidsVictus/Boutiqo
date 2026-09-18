import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { boutiqueRegistrationSchema, termsAcceptanceSchema } from "@/lib/validation/boutique";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

// Boutique owners have no INSERT policy on `boutiques` (see 0003_rls_policies.sql) —
// creation only happens here, after auth signup, using the service-role key. Terms
// acceptance is enforced server-side, not just by disabling a button in a UI.
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiUnauthorized("Sign up or log in before registering a boutique");

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "invalid_body", "Request body must be JSON");

  const registration = boutiqueRegistrationSchema.safeParse(body);
  if (!registration.success) return apiValidationError(registration.error);

  const terms = termsAcceptanceSchema.safeParse(body.terms);
  if (!terms.success) return apiValidationError(terms.error);

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("boutiques")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (existing) return apiError(409, "already_registered", "This account already has a boutique");

  const { name, area, ownerName, phone, gstNumber, category } = registration.data;

  const { data: boutique, error } = await admin
    .from("boutiques")
    .insert({
      owner_user_id: user.id,
      name,
      area: area || null,
      owner_name: ownerName,
      email: user.email ?? "",
      phone: phone || null,
      gst_number: gstNumber || null,
      category,
      terms_tnc_accepted: true,
      terms_privacy_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return apiError(500, "registration_failed", "Could not create the boutique record");

  return apiOk(boutique, 201);
}
