import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { confirmUploadSchema } from "@/lib/validation/file";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

// Called after the browser's direct PUT to R2 succeeds. Marks the file uploaded
// and re-points the parent (boutique logo / order cloth photo) at it.
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  const parsed = confirmUploadSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data: file, error: updateError } = await supabase
    .from("files")
    .update({ upload_status: "uploaded" })
    .eq("id", parsed.data.fileId)
    .select()
    .single();

  if (updateError || !file) return apiError(404, "not_found", "Upload record not found");

  if (file.kind === "boutique_logo") {
    const { error } = await supabase
      .from("boutiques")
      .update({ logo_file_id: file.id })
      .eq("id", file.boutique_id);
    if (error) return apiError(403, "update_failed", "Could not attach the logo");
  } else {
    const { error } = await supabase
      .from("orders")
      .update({ cloth_photo_file_id: file.id })
      .eq("id", file.order_id);
    if (error) return apiError(403, "update_failed", "Could not attach the cloth photo");
  }

  return apiOk(file);
}
