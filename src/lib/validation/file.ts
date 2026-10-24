import { z } from "zod";
import { ALLOWED_MIME_TYPES } from "@/lib/r2";

export const presignUploadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("boutique_logo"),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
      sizeBytes: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cloth_photo"),
      orderId: z.string().uuid(),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
      sizeBytes: z.number().int().positive(),
    })
    .strict(),
]);
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const confirmUploadSchema = z.object({
  fileId: z.string().uuid(),
  // "failed" lets the browser report that its PUT to storage did not go through,
  // so the pending row doesn't sit there looking like an upload in progress.
  outcome: z.enum(["uploaded", "failed"]).default("uploaded"),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

export const downloadUrlParamsSchema = z.object({
  fileId: z.string().uuid(),
});
