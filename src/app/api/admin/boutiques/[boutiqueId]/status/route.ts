import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { boutiqueStatusSchema } from "@/lib/validation/boutique";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

// hold / disable / activate. Uses the admin's own RLS-scoped client: the
// boutiques_update policy plus the enforce_boutique_update_rules trigger (0003
// migration) are what actually decide whether this sub-role may make this
// particular transition — this route does not duplicate that logic.
export async function POST(request: Request, { params }: { params: Promise<{ boutiqueId: string }> }) {
  const { boutiqueId } = await params;
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  const parsed = boutiqueStatusSchema.safeParse(body?.status);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data, error } = await supabase
    .from("boutiques")
    .update({ status: parsed.data })
    .eq("id", boutiqueId)
    .select()
    .single();

  if (error) return apiError(403, "forbidden", error.message.includes("admin") ? error.message : "Not allowed to change this boutique's status");
  return apiOk(data);
}
