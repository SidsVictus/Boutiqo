import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { presignDownloadUrl } from "@/lib/r2";
import { apiError, apiNotFound, apiOk, apiUnauthorized } from "@/lib/api-response";

// Owner-facing (authenticated) download path. The customer tracking page uses
// a completely separate, token-gated path — see /api/track/[token].
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const supabase = await createSupabaseRouteClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiUnauthorized();

  const { data: file, error } = await supabase
    .from("files")
    .select("object_key, upload_status")
    .eq("id", fileId)
    .single();

  if (error || !file) return apiNotFound();
  if (file.upload_status !== "uploaded") return apiError(409, "not_ready", "File has not finished uploading");

  const url = await presignDownloadUrl(file.object_key);
  return apiOk({ url, expiresInSeconds: 300 });
}
