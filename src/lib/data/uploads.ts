import { apiFetch } from "./supabaseClient";
import { ApiError } from "./store";
import type { FileKind } from "@/lib/supabase/types";

/** Mirrors src/lib/r2.ts's constants (server-only, so duplicated here rather
 * than imported into client code). Keep in sync with that file. */
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new ApiError("validation_failed", "File is larger than 10MB");
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
        reject(new ApiError("upload_failed", `The upload failed (R2 responded ${xhr.status}). Check your connection and try again.`));
      }
    };
    xhr.onerror = () => reject(new ApiError("upload_failed", "The upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new ApiError("upload_aborted", "The upload was cancelled."));
    xhr.send(file);
  });
}

/** POST /api/uploads/confirm. */
export async function confirmUpload(fileId: string): Promise<void> {
  await apiFetch("/api/uploads/confirm", { method: "POST", body: JSON.stringify({ fileId }) });
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
