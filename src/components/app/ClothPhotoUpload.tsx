"use client";

import * as React from "react";
import { Camera, ImageIcon, Upload as UploadIcon } from "./icons";
import { Button } from "@/components/ds/Button";
import { ALLOWED_MIME_TYPES, confirmUpload, getDownloadUrl, listClothPhotos, presignUpload, runPool, uploadFileWithProgress } from "@/lib/data/uploads";
import { ApiError } from "@/lib/data/store";

/** How many photos upload at once. */
const UPLOAD_CONCURRENCY = 3;

/** A photo chosen in the new-order wizard, held until the order exists. */
export interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

// Local React keys. (crypto.randomUUID needs a secure context, which a dev server on a LAN address isn't.)
let keySeq = 0;
const nextKey = () => `photo-${++keySeq}`;

export function toPendingPhotos(files: File[]): PendingPhoto[] {
  return files.map((file) => ({ id: nextKey(), file, previewUrl: URL.createObjectURL(file) }));
}

type Tile =
  | { key: string; kind: "saved"; fileId: string }
  | { key: string; kind: "uploading"; previewUrl: string; pct: number }
  | { key: string; kind: "uploaded"; previewUrl: string; fileId: string }
  | { key: string; kind: "failed"; previewUrl: string; reason: string; file: File };

function rejectedMessage(rejected: string[]): string {
  return `${rejected.length === 1 ? rejected[0] : `${rejected.length} files`} not added. Only JPEG, PNG, WEBP or HEIC images are allowed.`;
}

function splitAllowed(fileList: FileList | null): { allowed: File[]; rejected: string[] } {
  const allowed: File[] = [];
  const rejected: string[] = [];
  for (const file of Array.from(fileList ?? [])) {
    if (ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) allowed.push(file);
    else rejected.push(file.name);
  }
  return { allowed, rejected };
}

/** Presigns, PUTs to storage and confirms one photo. A PUT that doesn't go
 * through is reported to the server so its row doesn't stay "pending". */
export async function uploadClothPhoto(boutiqueId: string, orderId: string, file: File, onProgress: (pct: number) => void = () => {}): Promise<string> {
  const { fileId, uploadUrl } = await presignUpload("cloth_photo", file.type, file.size, boutiqueId, orderId);
  try {
    await uploadFileWithProgress(uploadUrl, file, onProgress);
    await confirmUpload(fileId);
  } catch (err) {
    await confirmUpload(fileId, "failed").catch(() => {});
    throw err;
  }
  return fileId;
}

function failureReason(err: unknown): string {
  return err instanceof ApiError ? err.message : "The photo upload failed. Check your connection and try again.";
}

/**
 * Cloth photos for an order — any number of them.
 *
 * `orderId` set (order page): lists the photos already saved, and every file
 * chosen uploads at once (a few at a time), each tile showing real byte-level
 * progress (XHR `upload.onprogress`), then success, or the error with Retry.
 *
 * `orderId` null (new-order wizard, step B): no order exists yet, and the
 * presign route needs one to authorize a cloth_photo upload, so the chosen
 * files are only previewed and handed to the parent through
 * `pending`/`onPendingChange`; the parent uploads them after the order is
 * created (see owner/(app)/orders/new/page.tsx).
 */
export function ClothPhotoUpload({
  boutiqueId,
  orderId,
  onAttached,
  pending = [],
  onPendingChange,
}: {
  boutiqueId: string;
  orderId: string | null;
  onAttached?: () => void;
  pending?: PendingPhoto[];
  onPendingChange?: (photos: PendingPhoto[]) => void;
}) {
  const [tiles, setTiles] = React.useState<Tile[]>([]);
  const [rejected, setRejected] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const patchTile = React.useCallback((key: string, next: Tile | null) => {
    setTiles((all) => all.flatMap((t) => (t.key === key ? (next ? [next] : []) : [t])));
  }, []);

  React.useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    listClothPhotos(orderId)
      .then((rows) => {
        if (cancelled) return;
        setTiles((all) => {
          const have = new Set(all.flatMap((t) => (t.kind === "uploaded" ? [t.fileId] : [])));
          return [...rows.filter((r) => !have.has(r.id)).map((r) => ({ key: r.id, kind: "saved" as const, fileId: r.id })), ...all];
        });
      })
      .catch(() => !cancelled && setRejected("Couldn't load this order's photos. Reload to try again."));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function startUpload(file: File, key: string, targetOrderId: string, previewUrl: string) {
    patchTile(key, { key, kind: "uploading", previewUrl, pct: 0 });
    try {
      const fileId = await uploadClothPhoto(boutiqueId, targetOrderId, file, (pct) => setTiles((all) => all.map((t) => (t.key === key && t.kind === "uploading" ? { ...t, pct } : t))));
      patchTile(key, { key, kind: "uploaded", previewUrl, fileId });
      onAttached?.();
    } catch (err) {
      patchTile(key, { key, kind: "failed", previewUrl, reason: failureReason(err), file });
    }
  }

  function handleFiles(fileList: FileList | null) {
    const { allowed, rejected: bad } = splitAllowed(fileList);
    setRejected(bad.length ? rejectedMessage(bad) : null);
    if (allowed.length === 0) return;
    if (!orderId) {
      onPendingChange?.([...pending, ...toPendingPhotos(allowed)]);
      return;
    }
    const batch = allowed.map((file) => ({ file, key: nextKey(), previewUrl: URL.createObjectURL(file) }));
    setTiles((all) => [...all, ...batch.map((b) => ({ key: b.key, kind: "uploading" as const, previewUrl: b.previewUrl, pct: 0 }))]);
    void runPool(batch, UPLOAD_CONCURRENCY, (b) => startUpload(b.file, b.key, orderId, b.previewUrl));
  }

  function retry(tile: Extract<Tile, { kind: "failed" }>) {
    if (orderId) void startUpload(tile.file, tile.key, orderId, tile.previewUrl);
  }

  function removePending(photo: PendingPhoto) {
    URL.revokeObjectURL(photo.previewUrl);
    onPendingChange?.(pending.filter((p) => p.id !== photo.id));
  }

  const count = orderId ? tiles.length : pending.length;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_MIME_TYPES.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ""; // so choosing the same photo again still fires
        }}
      />
      {count === 0 ? (
        <div className="bq-upload">
          <ImageIcon size={28} />
          <span className="bq-field__hint">No cloth photos yet</span>
        </div>
      ) : (
        <div className="bq-photo-grid">
          {orderId
            ? tiles.map((tile, i) => <PhotoTile key={tile.key} tile={tile} n={i + 1} onRetry={() => tile.kind === "failed" && retry(tile)} onDismiss={() => patchTile(tile.key, null)} />)
            : pending.map((photo, i) => (
                <div key={photo.id} className="bq-upload bq-upload--tile">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt={`Cloth photo preview ${i + 1}`} className="bq-upload__preview" />
                  <button type="button" className="bq-photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => removePending(photo)}>
                    ×
                  </button>
                </div>
              ))}
        </div>
      )}
      {rejected ? (
        <div className="bq-field__error" role="alert" style={{ marginTop: 8 }}>
          {rejected}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button variant="secondary" size="sm" iconLeft={<Camera size={16} />} onClick={() => inputRef.current?.click()}>
          {count === 0 ? "Take / choose photos" : "Add more photos"}
        </Button>
      </div>
      <div className="bq-field__hint" style={{ marginTop: 6 }}>
        JPEG, PNG, WEBP or HEIC. Add as many as you need.
      </div>
    </div>
  );
}

function PhotoTile({ tile, n, onRetry, onDismiss }: { tile: Tile; n: number; onRetry: () => void; onDismiss: () => void }) {
  if (tile.kind === "saved") return <SavedPhoto fileId={tile.fileId} n={n} />;
  return (
    <div className="bq-upload bq-upload--tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tile.previewUrl} alt={tile.kind === "uploaded" ? `Cloth photo ${n}` : `Cloth photo preview ${n}`} className="bq-upload__preview" />
      {tile.kind === "uploading" && (
        <div className="bq-photo-overlay">
          <div className="bq-upload__progress-track">
            <div className="bq-upload__progress-fill" style={{ width: `${tile.pct}%` }} />
          </div>
          <span className="bq-num" style={{ color: "#fff", fontSize: 14 }}>
            Uploading… {tile.pct}%
          </span>
        </div>
      )}
      {tile.kind === "failed" && (
        <div className="bq-photo-overlay bq-photo-overlay--failed">
          <span style={{ color: "#fff", fontSize: 14, textAlign: "center" }}>{tile.reason}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss} style={{ color: "#fff" }}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A photo already saved on the order: its short-lived download URL is fetched when the tile appears. */
function SavedPhoto({ fileId, n }: { fileId: string; n: number }) {
  const [url, setUrl] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    let cancelled = false;
    getDownloadUrl(fileId).then((u) => !cancelled && setUrl(u));
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  if (url === undefined) return <div className="bq-upload bq-upload--tile bq-skeleton" style={{ border: "none" }} />;
  if (url === null) {
    return (
      <div className="bq-upload bq-upload--tile">
        <UploadIcon size={22} />
        <span className="bq-field__hint" style={{ textAlign: "center", padding: "0 8px" }}>
          Photo unavailable
        </span>
      </div>
    );
  }
  return (
    <div className="bq-upload bq-upload--tile" style={{ borderStyle: "solid" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Cloth photo ${n}`} className="bq-upload__preview" />
    </div>
  );
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
