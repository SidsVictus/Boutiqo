import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { presignUploadSchema } from "@/lib/validation/file";
import { buildObjectKey, presignUploadUrl } from "@/lib/r2";
import { apiError, apiOk, apiUnauthorized, apiValidationError } from "@/lib/api-response";

// Authenticate -> authorize (does this user own this boutique/order?) -> validate
// file -> generate a short-lived presigned PUT URL -> browser uploads directly to
// R2 -> POST /api/uploads/confirm. The `files` row is inserted through the
// caller's own RLS-scoped client, so ownership is enforced by Postgres policy,
// not just by this route's logic.
export async function POST(request: Request) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return apiError(400, "invalid_body", "Request body must be JSON");

  const parsed = presignUploadSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { data: boutique } = await supabase
    .from("boutiques")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!boutique) return apiError(404, "no_boutique", "No boutique is registered for this account");

  if (parsed.data.kind === "cloth_photo") {
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("id", parsed.data.orderId)
      .maybeSingle();
    if (!order) return apiError(404, "order_not_found", "Order not found for this account");
  }

  const { objectKey, fileId: generatedFileId } =
    parsed.data.kind === "boutique_logo"
      ? buildObjectKey({ kind: "boutique_logo", boutiqueId: boutique.id, mimeType: parsed.data.mimeType })
      : buildObjectKey({
          kind: "cloth_photo",
          boutiqueId: boutique.id,
          orderId: parsed.data.orderId,
          mimeType: parsed.data.mimeType,
        });

  const { data: file, error } = await supabase
    .from("files")
    .insert({
      id: generatedFileId,
      boutique_id: boutique.id,
      kind: parsed.data.kind,
      order_id: parsed.data.kind === "cloth_photo" ? parsed.data.orderId : null,
      object_key: objectKey,
      mime_type: parsed.data.mimeType,
      size_bytes: parsed.data.sizeBytes,
    })
    .select()
    .single();

  if (error) return apiError(403, "insert_failed", "Could not authorize the upload");

  const uploadUrl = await presignUploadUrl(objectKey, parsed.data.mimeType);

  return apiOk({ fileId: file.id, objectKey, uploadUrl, expiresInSeconds: 300 });
}
