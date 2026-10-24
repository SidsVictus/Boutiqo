import { apiFetch, db } from "./supabaseClient";
import { ApiError } from "./store";
import type { FileKind } from "@/lib/supabase/types";

/** Mirrors src/lib/r2.ts's list (server-only, so duplicated here rather
 * than imported into client code). Keep in sync with that file. There is no
 * size limit. */
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

export interface PresignResult {
  fileId: string;
  uploadUrl: string; // a real, short-lived R2 presigned PUT URL.
}

/** POST /api/uploads/presign. */
export async function presignUpload(kind: FileKind, mimeType: string, sizeBytes: number, boutiqueId: string, orderId?: string): Promise<PresignResult> {
  void boutiqueId; // the real route derives the boutique from the session.
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new ApiError("validation_failed", "Only JPEG, PNG, WEBP or HEIC images are allowed");
  }
  const body = kind === "cloth_photo" ? { kind, orderId, mimeType, sizeBytes } : { kind, mimeType, sizeBytes };
  const result = await apiFetch<{ fileId: string; objectKey: string; uploadUrl: string; expiresInSeconds: number }>("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { fileId: result.fileId, uploadUrl: result.uploadUrl };
}

/**
 * Real upload against the presigned PUT URL, using XHR (not `fetch`)
 * specifically so `upload.onprogress` gives genuine byte-level progress —
 * see docs/phase3-report.md "Upload progress: XHR vs. fetch" for why this
 * was chosen over Phase 2's simulated determinate bar.
 */
export function uploadFileWithProgress(uploadUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new ApiError("upload_failed", `Photo storage rejected the upload (error ${xhr.status}). Try again.`));
      }
    };
    // A network-level failure: offline, or the storage bucket refusing this
    // site's origin (R2 CORS must allow PUT from the app's origin, see README).
    xhr.onerror = () => reject(new ApiError("upload_failed", "Couldn't reach photo storage. Check your connection and try again."));
    xhr.onabort = () => reject(new ApiError("upload_aborted", "The upload was cancelled."));
    xhr.send(file);
  });
}

/** POST /api/uploads/confirm. `outcome: "failed"` reports that the PUT to storage did not go through. */
export async function confirmUpload(fileId: string, outcome: "uploaded" | "failed" = "uploaded"): Promise<void> {
  await apiFetch("/api/uploads/confirm", { method: "POST", body: JSON.stringify({ fileId, outcome }) });
}

/** DELETE /api/files/:id — removes a cloth photo from storage and from the order. */
export async function deleteClothPhoto(fileId: string): Promise<void> {
  await apiFetch(`/api/files/${fileId}`, { method: "DELETE" });
}

/** The order's uploaded cloth photos, oldest first. RLS limits this to the caller's own boutique. */
export async function listClothPhotos(orderId: string): Promise<{ id: string }[]> {
  const { data, error } = await db()
    .from("files")
    .select("id")
    .eq("order_id", orderId)
    .eq("kind", "cloth_photo")
    .eq("upload_status", "uploaded")
    .order("created_at", { ascending: true });
  if (error) throw new ApiError("query_failed", "Could not load this order's photos");
  return (data ?? []) as { id: string }[];
}

/** Runs `worker` over `items`, at most `limit` at a time. Workers must not throw. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

/** GET /api/files/:id/download-url — a real, short-lived presigned GET URL. */
export async function getDownloadUrl(fileId: string): Promise<string | null> {
  try {
    const result = await apiFetch<{ url: string; expiresInSeconds: number }>(`/api/files/${fileId}/download-url`);
    return result.url;
  } catch {
    return null;
  }
}
