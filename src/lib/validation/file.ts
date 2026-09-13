import { z } from "zod";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/r2";

export const presignUploadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("boutique_logo"),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cloth_photo"),
      orderId: z.string().uuid(),
      mimeType: z.enum(ALLOWED_MIME_TYPES),
      sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
    })
    .strict(),
]);
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const confirmUploadSchema = z.object({
  fileId: z.string().uuid(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

export const downloadUrlParamsSchema = z.object({
  fileId: z.string().uuid(),
});
