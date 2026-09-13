import { files, simulate, uid } from "./store";
import { MockApiError } from "./store";
import type { FileKind } from "@/lib/supabase/types";

/** Mirrors src/lib/r2.ts's constants (Phase 1, server-only — duplicated here
 * rather than imported, since that module is `import "server-only"` and would
 * break if pulled into client-side mock code). Keep these two lists in sync;
 * Phase 3 should import the real ones directly once this seam is replaced. */
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface PresignResult {
  fileId: string;
  uploadUrl: string; // mock — never a real R2 URL
}

/** Mirrors POST /api/uploads/presign's validation (client-side check happens
 * before this is even called; this repeats it server-side-equivalent, as the
 * real route does). */
export async function presignUpload(kind: FileKind, mimeType: string, sizeBytes: number, boutiqueId: string, orderId?: string): Promise<PresignResult> {
  return simulate(() => {
    if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new MockApiError("validation_failed", "Only JPEG, PNG, WEBP or HEIC images are allowed");
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new MockApiError("validation_failed", "File is larger than 10MB");
    }
    const fileId = uid("f");
    files.push({
      id: fileId,
      boutique_id: boutiqueId,
      kind,
      order_id: orderId ?? null,
      object_key: `mock/boutiques/${boutiqueId}/${kind}/${fileId}`,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      upload_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { fileId, uploadUrl: `mock://upload/${fileId}` };
  }, { latencyMs: 150 });
}

/** Simulates the browser's direct PUT to R2 with measurable progress, via a
 * simple determinate progress callback (not a real byte-level upload — see
 * docs/phase2-report.md §6 for why a determinate simulated bar was chosen
 * over an indeterminate spinner). */
export function simulateUploadProgress(onProgress: (pct: number) => void, shouldFail = false): Promise<void> {
  return new Promise((resolve, reject) => {
    let pct = 0;
    const tick = () => {
      pct = Math.min(100, pct + 10 + Math.random() * 15);
      onProgress(Math.round(pct));
      if (pct >= 100) {
        if (shouldFail) reject(new MockApiError("upload_failed", "The upload failed. Check your connection and try again."));
        else resolve();
        return;
      }
      setTimeout(tick, 120);
    };
    setTimeout(tick, 120);
  });
}

export async function confirmUpload(fileId: string): Promise<void> {
  return simulate(() => {
    const file = files.find((f) => f.id === fileId);
    if (!file) throw new MockApiError("not_found", "Upload record not found");
    file.upload_status = "uploaded";
    file.updated_at = new Date().toISOString();
  }, { latencyMs: 150 });
}

export async function getDownloadUrl(fileId: string): Promise<string | null> {
  return simulate(() => {
    const file = files.find((f) => f.id === fileId);
    if (!file || file.upload_status !== "uploaded") return null;
    return `/assets/measure-front.png`; // mock stand-in for a presigned GET URL
  });
}
