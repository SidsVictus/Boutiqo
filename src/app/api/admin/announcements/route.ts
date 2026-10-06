import { z } from "zod";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiError, apiForbidden, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

const bodySchema = z.object({
  title: z.string().trim().min(1, "Add a heading").max(120, "Keep the heading under 120 characters"),
  body: z.string().trim().min(1, "Write the message").max(4000, "Keep the message under 4000 characters"),
});

// Admin announcement to every boutique. Inserted with the admin's OWN
// session, so RLS (announcements_insert: owner/support admins only,
// created_by = caller) is what authorises it, not this route.
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { data: role } = await supabase.rpc("current_admin_role");
  if (role !== "owner_admin" && role !== "support_admin") {
    logSecurityEvent("authorization_rejected", { userId: user.id, action: "post_announcement", reason: `role_${role ?? "none"}` });
    return apiForbidden("Only owner and support admins can send announcements");
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data, error } = await supabase
    .from("announcements")
    .insert({ title: parsed.data.title, body: parsed.data.body, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(`${error?.code} ${error?.message}`)) {
      return apiError(503, "not_set_up", "Announcements aren't set up yet: run supabase/migrations/0013_notifications_and_announcements.sql in Supabase.");
    }
    return apiError(500, "announce_failed", "Couldn't send the announcement. Try again.");
  }

  // How many boutiques it reaches (disabled ones can't sign in to see it).
  const { count } = await createSupabaseAdminClient().from("boutiques").select("id", { count: "exact", head: true }).neq("status", "disabled");
  return apiOk({ id: data.id, recipients: count ?? 0 }, 201);
}
