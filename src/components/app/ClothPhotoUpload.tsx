"use client";

import * as React from "react";
import { Camera, ImageIcon, Upload as UploadIcon } from "./icons";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/Badge";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, confirmUpload, presignUpload, uploadFileWithProgress } from "@/lib/data/uploads";
import { ApiError } from "@/lib/data/store";

type UploadState =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "selected"; previewUrl: string; file: File } // deferred mode only — see below
  | { kind: "uploading"; previewUrl: string; pct: number }
  | { kind: "success"; previewUrl: string; fileId: string }
  | { kind: "failed"; previewUrl: string; reason: string; file: File; fileId: string };

/**
 * Cloth photo capture/upload — replaces the prototype's <image-slot> placeholder.
 * Exercises every state from the Phase 2 brief §6: selection, client-side
 * validation, upload-in-progress (a real determinate bar, driven by XHR's
 * `upload.onprogress` — see docs/phase3-report.md "Upload progress: XHR vs.
 * fetch"), success, failure + retry, preview, delete. Unauthorized/missing-
 * file/expired-access are the *viewing* side's states — see RemoteImage.
 *
 * `orderId`: pass a real order id to upload immediately (order-detail page).
 * Pass `null` for the new-order wizard's step B, where no order exists yet —
 * Phase 1's presign route requires a real, existing order id for a
 * `cloth_photo` upload (it looks the order up to authorize the upload), so
 * this mode only selects + validates + previews the file locally and reports
 * it via `onFileSelected`; the caller uploads it for real after the order is
 * created (see owner/(app)/orders/new/page.tsx). Documented in
 * docs/phase3-report.md "Cloth-photo-in-wizard mismatch".
 */
export function ClothPhotoUpload({
  boutiqueId,
  orderId,
  onAttached,
  onFileSelected,
}: {
  boutiqueId: string;
  orderId: string | null;
  onAttached?: (fileId: string) => void;
  onFileSelected?: (file: File) => void;
}) {
  const [state, setState] = React.useState<UploadState>({ kind: "empty" });
  const inputRef = React.useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      return "Only JPEG, PNG, WEBP or HEIC images are allowed.";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) return "File is larger than 10MB.";
    return null;
  }

  async function startUpload(file: File, targetOrderId: string) {
    const previewUrl = URL.createObjectURL(file);
    setState({ kind: "uploading", previewUrl, pct: 0 });
    try {
      const { fileId, uploadUrl } = await presignUpload("cloth_photo", file.type, file.size, boutiqueId, targetOrderId);
      await uploadFileWithProgress(uploadUrl, file, (pct) => setState((s) => (s.kind === "uploading" ? { ...s, pct } : s)));
      await confirmUpload(fileId);
      setState({ kind: "success", previewUrl, fileId });
      onAttached?.(fileId);
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : "The upload failed. Check your connection and try again.";
      setState({ kind: "failed", previewUrl, reason, file, fileId: "" });
    }
  }

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const invalidReason = validate(file);
    if (invalidReason) {
      setState({ kind: "invalid", reason: invalidReason });
      return;
    }
    if (orderId) {
      void startUpload(file, orderId);
    } else {
      const previewUrl = URL.createObjectURL(file);
      setState({ kind: "selected", previewUrl, file });
      onFileSelected?.(file);
    }
  }

  function retry() {
    if (state.kind === "failed" && orderId) void startUpload(state.file, orderId);
  }

  function remove() {
    setState({ kind: "empty" });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(",")}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="bq-upload">
        {state.kind === "empty" && (
          <>
            <ImageIcon size={28} />
            <span className="bq-field__hint">No cloth photo yet</span>
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <ImageIcon size={28} />
            <span className="bq-field__error" style={{ textAlign: "center", padding: "0 16px" }}>
              {state.reason}
            </span>
          </>
        )}
        {(state.kind === "uploading" || state.kind === "success" || state.kind === "failed" || state.kind === "selected") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.previewUrl} alt="Cloth photo preview" className="bq-upload__preview" />
        )}
        {state.kind === "uploading" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(43,4,17,.44)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div className="bq-upload__progress-track">
              <div className="bq-upload__progress-fill" style={{ width: `${state.pct}%` }} />
            </div>
            <span style={{ color: "#fff", fontSize: 13 }} className="bq-num">
              Uploading… {state.pct}%
            </span>
          </div>
        )}
        {state.kind === "success" && (
          <span className="bq-upload__badge">
            <Badge tone="success">Uploaded</Badge>
          </span>
        )}
        {state.kind === "selected" && (
          <span className="bq-upload__badge">
            <Badge tone="brand">Selected — uploads with the order</Badge>
          </span>
        )}
        {state.kind === "failed" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(43,4,17,.6)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
            <span style={{ color: "#fff", fontSize: 13, textAlign: "center" }}>{state.reason}</span>
            <Button variant="secondary" size="sm" onClick={retry}>
              Retry upload
            </Button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button variant="secondary" size="sm" iconLeft={<Camera size={16} />} onClick={() => inputRef.current?.click()}>
          {state.kind === "empty" || state.kind === "invalid" ? "Take / choose photo" : "Replace photo"}
        </Button>
        {(state.kind === "success" || state.kind === "failed" || state.kind === "selected") && (
          <Button variant="ghost" size="sm" onClick={remove}>
            Remove
          </Button>
        )}
      </div>
      <div className="bq-field__hint" style={{ marginTop: 6 }}>
        JPEG, PNG, WEBP or HEIC, up to 10MB.
      </div>
    </div>
  );
}

/** Uploads a file already selected in deferred mode (see above) once a real
 * order id exists. Used by the new-order wizard after `createOrder` succeeds. */
export async function uploadDeferredClothPhoto(boutiqueId: string, orderId: string, file: File): Promise<string> {
  const { fileId, uploadUrl } = await presignUpload("cloth_photo", file.type, file.size, boutiqueId, orderId);
  await uploadFileWithProgress(uploadUrl, file, () => {});
  await confirmUpload(fileId);
  return fileId;
}

/** Viewing-only states for a remote presigned R2 image — used on the customer
 * tracking page and the owner order-detail page's read view. */
export function RemoteImage({ status, src }: { status: "loading" | "ready" | "missing" | "expired" | "unauthorized"; src?: string }) {
  if (status === "loading") {
    return <div className="bq-upload bq-skeleton" style={{ border: "none" }} />;
  }
  if (status === "ready" && src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Cloth photo" className="bq-upload__preview" style={{ position: "static", borderRadius: "var(--radius-lg)", width: "100%", height: 200, objectFit: "cover" }} />;
  }
  const messages: Record<string, string> = {
    missing: "No cloth photo has been added for this order yet.",
    expired: "This photo link has expired. Ask the boutique to resend the tracking link.",
    unauthorized: "You don't have access to this photo.",
  };
  return (
    <div className="bq-upload" style={{ height: 160 }}>
      <UploadIcon size={22} />
      <span className="bq-field__hint" style={{ textAlign: "center", padding: "0 16px" }}>
        {messages[status]}
      </span>
    </div>
  );
}
