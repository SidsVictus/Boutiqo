import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

// Kept in one place because the DB CHECK constraints on public.files (0002 migration)
// and the client-side <input accept> (Phase 2) must all agree with this list.
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// 10MB — the design bundle doesn't specify a limit; this is a documented default
// (see docs/decisions.md) generous enough for a phone camera photo.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getBucketName(): string {
  return required("R2_BUCKET_NAME", process.env.R2_BUCKET_NAME);
}

/**
 * S3-compatible client for Cloudflare R2. Credentials are read from
 * server-only env vars — never expose these to a client bundle.
 *
 * R2_ENDPOINT may be overridden (used by tests to point at a local
 * S3-compatible mock instead of live Cloudflare infrastructure).
 */
export function getR2Client(): S3Client {
  const accountId = required("R2_ACCOUNT_ID", process.env.R2_ACCOUNT_ID);
  const accessKeyId = required("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY", process.env.R2_SECRET_ACCESS_KEY);
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const isLocalMock = Boolean(process.env.R2_ENDPOINT);

  return new S3Client({
    // R2 ignores the region (it's a single global namespace) and accepts "auto".
    // A local S3-compatible mock (used in tests) validates SigV4 against a real
    // region string, so use a conventional one there instead.
    region: isLocalMock ? "us-east-1" : "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: isLocalMock, // path-style needed for local S3 mocks
  });
}

export type ObjectKeyParams =
  | { kind: "boutique_logo"; boutiqueId: string; mimeType: AllowedMimeType }
  | { kind: "cloth_photo"; boutiqueId: string; orderId: string; mimeType: AllowedMimeType };

/**
 * Tenant-scoped, collision-safe object key. A fresh random file id per upload
 * means retries/replacements never collide and old objects are never overwritten
 * in place (the DB's logo_file_id / cloth_photo_file_id pointer is what "current" means).
 */
export function buildObjectKey(params: ObjectKeyParams): { objectKey: string; fileId: string } {
  const fileId = randomUUID();
  const ext = MIME_TO_EXT[params.mimeType];

  const objectKey =
    params.kind === "boutique_logo"
      ? `boutiques/${params.boutiqueId}/logo/${fileId}.${ext}`
      : `boutiques/${params.boutiqueId}/orders/${params.orderId}/cloth/${fileId}.${ext}`;

  return { objectKey, fileId };
}

const PUT_URL_TTL_SECONDS = 5 * 60;
const GET_URL_TTL_SECONDS = 5 * 60;

export async function presignUploadUrl(objectKey: string, mimeType: string): Promise<string> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: objectKey,
    ContentType: mimeType,
  });
  return getSignedUrl(client, command, { expiresIn: PUT_URL_TTL_SECONDS });
}

export async function presignDownloadUrl(objectKey: string): Promise<string> {
  const client = getR2Client();
  const command = new GetObjectCommand({ Bucket: getBucketName(), Key: objectKey });
  return getSignedUrl(client, command, { expiresIn: GET_URL_TTL_SECONDS });
}

export async function deleteObject(objectKey: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: objectKey }));
}
