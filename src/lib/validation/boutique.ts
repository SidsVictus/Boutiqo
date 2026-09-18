import { z } from "zod";

// Registration fields (owner-register screen). Gmail is the design's assumption about
// the target user, not a stated backend validation rule (see CLAUDE_CODE_HANDOFF.md §4.1
// discussion) — we accept any syntactically valid email rather than hard-blocking non-Gmail.
export const boutiqueRegistrationSchema = z.object({
  name: z.string().trim().min(1, "Boutique name is required").max(200),
  area: z.string().trim().max(200).optional(),
  ownerName: z.string().trim().min(1, "Owner name is required").max(200),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  gstNumber: z
    .string()
    .trim()
    .regex(/^[0-9A-Z]{15}$/, "GST number must be 15 characters")
    .optional()
    .or(z.literal("")),
  category: z.string().trim().min(1, "Business category is required").max(200),
});
export type BoutiqueRegistrationInput = z.infer<typeof boutiqueRegistrationSchema>;

export const termsAcceptanceSchema = z.object({
  tnc: z.literal(true, { message: "Terms & conditions must be accepted" }),
  privacy: z.literal(true, { message: "Privacy policy must be accepted" }),
});
export type TermsAcceptanceInput = z.infer<typeof termsAcceptanceSchema>;

export const boutiqueStatusSchema = z.enum(["active", "on_hold", "disabled"]);

// admin-add: Super Admin creating a tenant directly.
export const adminCreateBoutiqueSchema = boutiqueRegistrationSchema.extend({
  ownerEmail: z.string().trim().email("Enter a valid email address"),
});
export type AdminCreateBoutiqueInput = z.infer<typeof adminCreateBoutiqueSchema>;
