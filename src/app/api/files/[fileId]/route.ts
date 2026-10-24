import { z } from "zod";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteObject } from "@/lib/r2";
import { apiError, apiNotFound, apiOk, apiUnauthorized } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

// Deletes one cloth photo: the R2 object, then its `files` row. `files` has no
// DELETE policy, so ownership is established with the caller's own RLS-scoped
// read (another boutique's file simply isn't visible: 404), and only then does
// the privileged client remove the row. The object goes first so a storage
// failure leaves the row in place and the delete can be retried.
export async function DELETE(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { fileId } = await params;
  if (!z.string().uuid().safeParse(fileId).success) return apiNotFound("Photo not found");

  const { data: boutique } = await supabase.from("boutiques").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!boutique) return apiError(404, "no_boutique", "No boutique is registered for this account");

  const { data: file } = await supabase.from("files").select("id, boutique_id, kind, order_id, object_key").eq("id", fileId).maybeSingle();
  // Admins can read every boutique's files; deleting is the owner's own action.
  if (!file || file.boutique_id !== boutique.id) {
    logSecurityEvent("authorization_rejected", { userId: user.id, action: "delete_file", reason: "file_not_found_or_not_owned", fileId });
    return apiNotFound("Photo not found");
  }
  if (file.kind !== "cloth_photo") return apiError(400, "unsupported_kind", "Only cloth photos can be deleted");

  try {
    await deleteObject(file.object_key);
  } catch (err) {
    logSecurityEvent("upload_failed", { userId: user.id, stage: "delete_object", fileId, reason: err instanceof Error ? err.message : String(err) });
    return apiError(503, "storage_unavailable", "Photo storage isn't available right now. Try again later.");
  }

  const { error } = await createSupabaseAdminClient().from("files").delete().eq("id", file.id).eq("boutique_id", boutique.id);
  if (error) {
    logSecurityEvent("upload_failed", { userId: user.id, stage: "delete_row", fileId, reason: error.message });
    return apiError(500, "delete_failed", "Could not delete the photo");
  }

  // If it was the order's cover, the cover moves to the next oldest photo (or none).
  const { data: order } = await supabase.from("orders").select("cloth_photo_file_id").eq("id", file.order_id).maybeSingle();
  if (order && (order.cloth_photo_file_id === null || order.cloth_photo_file_id === file.id)) {
    const { data: next } = await supabase
      .from("files")
      .select("id")
      .eq("order_id", file.order_id)
      .eq("kind", "cloth_photo")
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: true })
      .limit(1);
    await supabase.from("orders").update({ cloth_photo_file_id: next?.[0]?.id ?? null }).eq("id", file.order_id);
  }

  return apiOk({ id: file.id });
}
