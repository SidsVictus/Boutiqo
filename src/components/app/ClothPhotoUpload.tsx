"use client";

import * as React from "react";
import { Camera, ImageIcon, Upload as UploadIcon } from "./icons";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ds/Badge";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, confirmUpload, presignUpload, simulateUploadProgress } from "@/lib/data/uploads";
import { MockApiError, isForcingFailure } from "@/lib/data/store";

type UploadState =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "uploading"; previewUrl: string; pct: number }
  | { kind: "success"; previewUrl: string; fileId: string }
  | { kind: "failed"; previewUrl: string; reason: string; file: File; fileId: string };

/**
 * Cloth photo capture/upload — replaces the prototype's <image-slot> placeholder.
 * Exercises every state from Phase 2 brief §6: selection, client-side
 * validation, upload-in-progress (determinate bar — chosen over an
 * indeterminate spinner because the real flow is a single PUT to R2 whose
 * progress IS measurable via XHR upload events; a determinate bar is what
 * Phase 3's real implementation will show), success, failure + retry,
 * preview, delete. Unauthorized / missing-file / expired-access are the
 * *viewing* side's states — see RemoteImage for those (tracking page).
 */
export function ClothPhotoUpload({
  boutiqueId,
  orderId,
  onAttached,
}: {
  boutiqueId: string;
  orderId: string;
  onAttached?: (fileId: string) => void;
}) {
  const [state, setState] = React.useState<UploadState>({ kind: "empty" });
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function startUpload(file: File) {
    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      setState({ kind: "invalid", reason: "Only JPEG, PNG, WEBP or HEIC images are allowed." });
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setState({ kind: "invalid", reason: "File is larger than 10MB." });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setState({ kind: "uploading", previewUrl, pct: 0 });
    try {
      const { fileId } = await presignUpload("cloth_photo", file.type, file.size, boutiqueId, orderId);
      await simulateUploadProgress((pct) => setState((s) => (s.kind === "uploading" ? { ...s, pct } : s)), isForcingFailure());
      await confirmUpload(fileId);
      setState({ kind: "success", previewUrl, fileId });
      onAttached?.(fileId);
    } catch (err) {
      const reason = err instanceof MockApiError ? err.message : "The upload failed. Check your connection and try again.";
      setState({ kind: "failed", previewUrl, reason, file, fileId: "" });
    }
  }

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) void startUpload(file);
  }

  function retry() {
    if (state.kind === "failed") void startUpload(state.file);
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
        {(state.kind === "uploading" || state.kind === "success" || state.kind === "failed") && (
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
        {(state.kind === "success" || state.kind === "failed") && (
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

/** Viewing-only states for a remote (would-be presigned R2) image — used on
 * the customer tracking page and the owner order-detail page's read view.
 * `status` simulates what a real presigned-URL fetch would report. */
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
