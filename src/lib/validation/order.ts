import { z } from "zod";
import { MEASUREMENT_FIELDS } from "@/lib/supabase/types";

// One-decimal inch measurement, 0–199.9, all 14 fields optional (see
// CLAUDE_CODE_HANDOFF.md's 14-field measurement guide).
const measurementValue = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v)) : v))
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || (Number.isFinite(v) && v >= 0 && v < 200), {
    message: "Measurement must be between 0 and 199.9 inches",
  })
  .transform((v) => (v === undefined ? null : v === null ? null : Math.round(v * 10) / 10));

const measurementsShape = Object.fromEntries(
  MEASUREMENT_FIELDS.map((field) => [field, measurementValue]),
) as Record<(typeof MEASUREMENT_FIELDS)[number], typeof measurementValue>;

export const measurementsSchema = z.object(measurementsShape);
export type MeasurementsInput = z.infer<typeof measurementsSchema>;

const commonDressTypes = [
  "Blouse",
  "Saree blouse",
  "Kurta",
  "Kurta set",
  "Anarkali kurta",
  "Lehenga",
  "Lehenga blouse",
  "Bridal lehenga",
  "Salwar suit",
  "Palazzo set",
  "Gown",
  "Crop top + skirt",
  "Other",
] as const;

export const orderCreateSchema = z
  .object({
    customerId: z.string().uuid("Select a customer"),
    garmentType: z.string().trim().min(1, "Garment type is required").max(100),
    garmentTypeOther: z.string().trim().max(200).optional().or(z.literal("")),
    dueDate: z.iso.date("Enter a valid delivery date"),
    totalAmount: z.number().nonnegative("Total must be 0 or more"),
    advanceAmount: z.number().nonnegative("Advance must be 0 or more"),
    tailorName: z.string().trim().max(100).optional().or(z.literal("")),
    clothDescription: z.string().trim().max(500).optional().or(z.literal("")),
    styleNotes: z.string().trim().max(2000).optional().or(z.literal("")),
    measurements: measurementsSchema.partial().optional(),
  })
  .refine((data) => data.advanceAmount <= data.totalAmount, {
    message: "Advance cannot exceed the total amount",
    path: ["advanceAmount"],
  })
  .refine((data) => data.garmentType !== "Other" || Boolean(data.garmentTypeOther), {
    message: "Describe the garment type",
    path: ["garmentTypeOther"],
  });
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const orderStageSchema = z.enum(["received", "cutting", "stitching", "ready", "delivered"]);

export const orderStageUpdateSchema = z.object({
  stage: orderStageSchema,
});

export const orderMarkPaidSchema = z.object({
  orderId: z.string().uuid(),
});

export { commonDressTypes };
