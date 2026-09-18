/**
 * R2 upload/download flow, tested against a local S3-compatible mock (s3rver).
 *
 * Why a mock and not live Cloudflare R2: this sandboxed session's Cloudflare account
 * has R2 disabled at the dashboard level (a one-time human step, `R2_buckets_list`
 * returns "Please enable R2 through the Cloudflare Dashboard"), and even once enabled,
 * outbound network to *.r2.cloudflarestorage.com is blocked by this session's egress
 * policy (see docs/phase1-report.md "Known limitations"). R2 is S3-compatible, so this
 * exercises the exact same code path (src/lib/r2.ts) against a real S3-protocol server
 * — presigned URL generation, PutObject, GetObject, DeleteObject all execute for real,
 * only the endpoint differs. Point R2_ENDPOINT at nothing (unset) to run this same
 * client against live R2.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import S3rver from "s3rver";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  buildObjectKey,
  deleteObject,
  getR2Client,
  presignDownloadUrl,
  presignUploadUrl,
} from "@/lib/r2";
import { presignUploadSchema } from "@/lib/validation/file";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const PORT = 4569;
let server: InstanceType<typeof S3rver>;

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boutiqo-s3rver-"));
  server = new S3rver({
    address: "127.0.0.1",
    port: PORT,
    silent: true,
    directory: dir,
    vhostBuckets: false,
    configureBuckets: [{ name: "boutiqo-dev" }],
  });
  await server.run();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err?: Error) => (err ? reject(err) : resolve())),
  );
});

describe("buildObjectKey", () => {
  it("builds a tenant-scoped, collision-safe key for a boutique logo", () => {
    const { objectKey, fileId } = buildObjectKey({
      kind: "boutique_logo",
      boutiqueId: "b1",
      mimeType: "image/png",
    });
    expect(objectKey).toBe(`boutiques/b1/logo/${fileId}.png`);
  });

  it("builds a tenant- and order-scoped key for a cloth photo", () => {
    const { objectKey, fileId } = buildObjectKey({
      kind: "cloth_photo",
      boutiqueId: "b1",
      orderId: "o1",
      mimeType: "image/jpeg",
    });
    expect(objectKey).toBe(`boutiques/b1/orders/o1/cloth/${fileId}.jpg`);
  });

  it("never reuses a file id across two calls for the same order", () => {
    const a = buildObjectKey({ kind: "cloth_photo", boutiqueId: "b1", orderId: "o1", mimeType: "image/png" });
    const b = buildObjectKey({ kind: "cloth_photo", boutiqueId: "b1", orderId: "o1", mimeType: "image/png" });
    expect(a.objectKey).not.toBe(b.objectKey);
  });
});

describe("presigned upload + download against a real S3-protocol server", () => {
  it("authorized upload then authorized download round-trips the exact bytes", async () => {
    const { objectKey } = buildObjectKey({ kind: "boutique_logo", boutiqueId: "b1", mimeType: "image/png" });
    const body = Buffer.from("fake-png-bytes-for-test");

    const putUrl = await presignUploadUrl(objectKey, "image/png");
    const putRes = await fetch(putUrl, { method: "PUT", body, headers: { "Content-Type": "image/png" } });
    expect(putRes.ok).toBe(true);

    const getUrl = await presignDownloadUrl(objectKey);
    const getRes = await fetch(getUrl);
    expect(getRes.ok).toBe(true);
    const downloaded = Buffer.from(await getRes.arrayBuffer());
    expect(downloaded.equals(body)).toBe(true);
  });

  it("downloading a missing object fails", async () => {
    const getUrl = await presignDownloadUrl("boutiques/b1/logo/does-not-exist.png");
    const res = await fetch(getUrl);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });

  it("an expired presigned URL is rejected", async () => {
    // Recreate the signing call with a 1-second TTL to prove expiry is enforced,
    // rather than waiting out the real 5-minute TTL presignUploadUrl uses.
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = getR2Client();
    const { objectKey } = buildObjectKey({ kind: "boutique_logo", boutiqueId: "b1", mimeType: "image/png" });
    const putCommand = new PutObjectCommand({ Bucket: "boutiqo-dev", Key: objectKey, ContentType: "image/png" });
    const shortLivedUrl = await getSignedUrl(client, putCommand, { expiresIn: 1 });

    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(shortLivedUrl, { method: "PUT", body: Buffer.from("too-late") });
    expect(res.ok).toBe(false);
  });

  // Note: an unauthenticated bare GET against a real private R2/S3 bucket is denied
  // (AccessDenied) — that's the entire reason every download goes through
  // presignDownloadUrl(). Not asserted here because s3rver (the local mock) treats a
  // request with no auth mechanism at all as anonymous-allowed by default, which is a
  // limitation of the mock, not of the R2 bucket policy this code assumes.

  it("delete then download returns not-found", async () => {
    const { objectKey } = buildObjectKey({ kind: "boutique_logo", boutiqueId: "b1", mimeType: "image/png" });
    const putUrl = await presignUploadUrl(objectKey, "image/png");
    await fetch(putUrl, { method: "PUT", body: Buffer.from("temp") });

    await deleteObject(objectKey);

    const getUrl = await presignDownloadUrl(objectKey);
    const res = await fetch(getUrl);
    expect(res.status).toBe(404);
  });
});

describe("upload validation (server-side, not just an <input accept>)", () => {
  it("rejects a disallowed mime type", () => {
    const result = presignUploadSchema.safeParse({ kind: "boutique_logo", mimeType: "application/pdf", sizeBytes: 1000 });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized file", () => {
    const result = presignUploadSchema.safeParse({
      kind: "boutique_logo",
      mimeType: "image/png",
      sizeBytes: MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts every allowed mime type at the size boundary", () => {
    for (const mimeType of ALLOWED_MIME_TYPES) {
      const result = presignUploadSchema.safeParse({ kind: "boutique_logo", mimeType, sizeBytes: MAX_FILE_SIZE_BYTES });
      expect(result.success).toBe(true);
    }
  });

  it("requires orderId for a cloth_photo but rejects it for a boutique_logo", () => {
    expect(presignUploadSchema.safeParse({ kind: "cloth_photo", mimeType: "image/png", sizeBytes: 1000 }).success).toBe(
      false,
    );
    expect(
      presignUploadSchema.safeParse({ kind: "boutique_logo", orderId: "not-allowed-here", mimeType: "image/png", sizeBytes: 1000 })
        .success,
    ).toBe(false);
  });
});
