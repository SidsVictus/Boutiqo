import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { confirmUploadSchema } from "@/lib/validation/file";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

// Called after the browser's direct PUT to R2 finishes. `outcome: "uploaded"`
// (the default) marks the file uploaded and, for the boutique logo, re-points
// the boutique at it; a cloth photo only joins the order's gallery, and the
// order's cover pointer is set if it has none yet. `outcome: "failed"` records
// that the PUT did not go through.
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  const parsed = confirmUploadSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  if (parsed.data.outcome === "failed") {
    // Only a still-pending row can fail; one already uploaded stays uploaded.
    const { data, error } = await supabase.from("files").update({ upload_status: "failed" }).eq("id", parsed.data.fileId).eq("upload_status", "pending").select();
    if (error) {
      logSecurityEvent("upload_failed", { userId: user.id, stage: "report_failed", fileId: parsed.data.fileId, reason: error.message });
      return apiError(403, "update_failed", "Could not update the upload record");
    }
    return apiOk(data?.[0] ?? null);
  }

  const { data: file, error: updateError } = await supabase
    .from("files")
    .update({ upload_status: "uploaded" })
    .eq("id", parsed.data.fileId)
    .select()
    .single();

  if (updateError || !file) {
    logSecurityEvent("upload_failed", { userId: user.id, stage: "confirm", fileId: parsed.data.fileId, reason: updateError?.message ?? "not_found" });
    return apiError(404, "not_found", "Upload record not found");
  }

  if (file.kind === "boutique_logo") {
    const { error } = await supabase
      .from("boutiques")
      .update({ logo_file_id: file.id })
      .eq("id", file.boutique_id);
    if (error) {
      logSecurityEvent("upload_failed", { userId: user.id, stage: "confirm_attach_logo", fileId: file.id, reason: error.message });
      return apiError(403, "update_failed", "Could not attach the logo");
    }
  } else {
    // The photo is already part of the order (files.order_id); this only makes
    // the first one the cover. Matching on "no cover yet" keeps concurrent
    // confirms of a multi-photo upload from fighting over it.
    const { error } = await supabase
      .from("orders")
      .update({ cloth_photo_file_id: file.id })
      .eq("id", file.order_id)
      .is("cloth_photo_file_id", null);
    if (error) {
      logSecurityEvent("upload_failed", { userId: user.id, stage: "confirm_attach_cloth_photo", fileId: file.id, reason: error.message });
      return apiError(403, "update_failed", "Could not attach the cloth photo");
    }
  }

  return apiOk(file);
}
