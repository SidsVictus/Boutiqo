import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { z } from "zod";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

const bodySchema = z.object({ active: z.boolean() });

// Suspend/reactivate another admin. The admins_update RLS policy already
// restricts this to owner_admin — this route just forwards to it.
export async function POST(request: Request, { params }: { params: Promise<{ adminId: string }> }) {
  const { adminId } = await params;
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data, error } = await supabase
    .from("admins")
    .update({ active: parsed.data.active })
    .eq("id", adminId)
    .select()
    .single();

  if (error) {
    logSecurityEvent("authorization_rejected", { userId: user.id, action: "admin_active_toggle", targetAdminId: adminId, attemptedActive: parsed.data.active, reason: error.message });
    return apiError(403, "forbidden", "Only an owner admin can suspend or reactivate admins");
  }
  return apiOk(data);
}
