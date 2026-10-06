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
  const { name, area, ownerName, phone, gstNumber, category } = parsed.data;
  // Auth emails are case-insensitive; store the same form everywhere so the
  // owner's sign-in (Google or password, any device) always matches.
  const ownerEmail = parsed.data.ownerEmail.trim().toLowerCase();

  // The owner may already have an account, e.g. they tried "Continue with
  // Google" on their phone before this. Reuse it if it isn't already a
  // boutique owner or an admin, so their existing sign-in keeps working.
  let ownerUserId: string | null = null;
  let createdNewUser = false;
  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    email_confirm: true,
    user_metadata: { created_by: "admin-add", full_name: ownerName },
  });
  if (created?.user) {
    ownerUserId = created.user.id;
    createdNewUser = true;
  } else {
    const existing = await findUserIdByEmail(admin, ownerEmail);
    if (!existing) {
      logSecurityEvent("admin_add_owner_failed", { reason: createUserError?.message ?? "unknown" });
      return apiError(500, "user_create_failed", "Could not create the owner's account. Try again.");
    }
    const [{ data: ownsBoutique }, { data: isAdminRow }] = await Promise.all([
      admin.from("boutiques").select("id").eq("owner_user_id", existing).maybeSingle(),
      admin.from("admins").select("id").eq("user_id", existing).maybeSingle(),
    ]);
    if (ownsBoutique) return apiError(409, "email_has_boutique", "This email already owns a boutique on Boutiqo. Use a different owner email.");
    if (isAdminRow) return apiError(409, "email_is_admin", "This email belongs to a Boutiqo admin. Use the owner's own email.");
    ownerUserId = existing;
  }

  const { data: boutique, error } = await admin
    .from("boutiques")
    .insert({
      owner_user_id: ownerUserId,
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
    if (createdNewUser) await admin.auth.admin.deleteUser(ownerUserId);
    return apiError(500, "boutique_create_failed", "Could not create the boutique record");
  }

  // Tell the owner how to get in: a "set your password" email (any device,
  // any browser: implicit-flow link handled by /auth/confirm). They can also
  // just use "Continue with Google" with this same Gmail address.
  const origin = new URL(request.url).origin;
  const { error: mailError } = await admin.auth.resetPasswordForEmail(ownerEmail, {
    redirectTo: `${origin}/auth/confirm?next=/owner/reset-password`,
  });
  if (mailError) logSecurityEvent("admin_add_welcome_email_failed", { reason: mailError.message });

  return apiOk({ ...boutique, welcome_email_sent: !mailError }, 201);
}

/** Auth user id for an email (admin API has no direct lookup; Boutiqo's user
 * count is small, so page through). */
async function findUserIdByEmail(admin: ReturnType<typeof createSupabaseAdminClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
