import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminCreateBoutiqueSchema } from "@/lib/validation/boutique";
import { apiError, apiForbidden, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

// admin-add: Super Admin creates a tenant directly (a second, independent path
// into `boutiques` alongside owner self-signup — see docs/decisions.md #4).
// Needs the service-role key because it also has to create the owner's auth user.
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    logSecurityEvent("authorization_rejected", { userId: user.id, action: "admin_create_boutique", reason: "not_an_admin" });
    return apiForbidden("Only Super Admin can add a boutique");
  }

  const { data: role } = await supabase.rpc("current_admin_role");
  if (role === "viewer" || role === "billing_admin") {
    logSecurityEvent("authorization_rejected", { userId: user.id, action: "admin_create_boutique", reason: `role_${role}_not_permitted` });
    return apiForbidden(`${role} admins cannot add a boutique`);
  }

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "invalid_body", "Request body must be JSON");

  const parsed = adminCreateBoutiqueSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const admin = createSupabaseAdminClient();
  const { name, area, ownerName, ownerEmail, phone, gstNumber, category } = parsed.data;

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    user_metadata: { created_by: "admin-add" },
  });
  if (createUserError || !created.user) {
    return apiError(409, "user_create_failed", "Could not create the owner account (email may already be in use)");
  }

  const { data: boutique, error } = await admin
    .from("boutiques")
    .insert({
      owner_user_id: created.user.id,
      name,
      area: area || null,
      owner_name: ownerName,
      email: ownerEmail,
      phone: phone || null,
      gst_number: gstNumber || null,
      category,
      terms_tnc_accepted: true,
      terms_privacy_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return apiError(500, "boutique_create_failed", "Could not create the boutique record");
  }

  return apiOk(boutique, 201);
}
