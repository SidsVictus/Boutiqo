import { describe, expect, it } from "vitest";
import { boutiqueRegistrationSchema, termsAcceptanceSchema } from "@/lib/validation/boutique";
import { customerCreateSchema } from "@/lib/validation/customer";
import { measurementsSchema, orderCreateSchema } from "@/lib/validation/order";

describe("boutiqueRegistrationSchema", () => {
  it("accepts a valid registration", () => {
    const result = boutiqueRegistrationSchema.safeParse({
      name: "Meera Boutique",
      area: "Banjara Hills",
      ownerName: "Meera Nandini",
      phone: "98490 76543",
      gstNumber: "36AAKCM1234P1Z9",
      category: "Ladies tailoring & boutique",
    });
    expect(result.success).toBe(true);
  });

  it("does not hard-block a non-Gmail address (registration schema has no email field; auth email is separate)", () => {
    // boutiqueRegistrationSchema intentionally has no email validation of its own —
    // email comes from the authenticated Supabase user, not the registration form.
    expect(Object.keys(boutiqueRegistrationSchema.shape)).not.toContain("email");
  });

  it("rejects a missing name", () => {
    const result = boutiqueRegistrationSchema.safeParse({
      ownerName: "Meera Nandini",
      category: "Ladies tailoring",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed GST number", () => {
    const result = boutiqueRegistrationSchema.safeParse({
      name: "X",
      ownerName: "Y",
      category: "Z",
      gstNumber: "not-a-gst-number",
    });
    expect(result.success).toBe(false);
  });
});

describe("termsAcceptanceSchema", () => {
  it("requires both checkboxes to be literally true", () => {
    expect(termsAcceptanceSchema.safeParse({ tnc: true, privacy: true }).success).toBe(true);
    expect(termsAcceptanceSchema.safeParse({ tnc: false, privacy: true }).success).toBe(false);
    expect(termsAcceptanceSchema.safeParse({ tnc: true, privacy: false }).success).toBe(false);
    expect(termsAcceptanceSchema.safeParse({}).success).toBe(false);
  });
});

describe("customerCreateSchema", () => {
  it("requires only a name", () => {
    expect(customerCreateSchema.safeParse({ name: "Aisha Fatima" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(customerCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a malformed phone number", () => {
    expect(customerCreateSchema.safeParse({ name: "A", phone: "not-a-phone" }).success).toBe(false);
  });
});

describe("measurementsSchema", () => {
  it("accepts all 14 fields empty", () => {
    expect(measurementsSchema.partial().safeParse({}).success).toBe(true);
  });

  it("rounds to one decimal place", () => {
    const result = measurementsSchema.partial().safeParse({ m01_blouse_back_length: 15.049 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.m01_blouse_back_length).toBe(15.0);
  });

  it("rejects an out-of-range measurement", () => {
    expect(measurementsSchema.partial().safeParse({ m11_bust_around: 250 }).success).toBe(false);
    expect(measurementsSchema.partial().safeParse({ m11_bust_around: -1 }).success).toBe(false);
  });
});

describe("orderCreateSchema", () => {
  const base = {
    customerId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    garmentType: "Lehenga blouse",
    dueDate: "2026-09-30",
    totalAmount: 4500,
    advanceAmount: 2000,
  };

  it("accepts a minimal valid order", () => {
    expect(orderCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects advance greater than total (business rule, not just UI)", () => {
    const result = orderCreateSchema.safeParse({ ...base, advanceAmount: 9999 });
    expect(result.success).toBe(false);
  });

  it("requires garmentTypeOther when garmentType is Other", () => {
    expect(orderCreateSchema.safeParse({ ...base, garmentType: "Other" }).success).toBe(false);
    expect(
      orderCreateSchema.safeParse({ ...base, garmentType: "Other", garmentTypeOther: "Choli set" }).success,
    ).toBe(true);
  });

  it("rejects an invalid date", () => {
    expect(orderCreateSchema.safeParse({ ...base, dueDate: "not-a-date" }).success).toBe(false);
  });

  it("rejects a negative total", () => {
    expect(orderCreateSchema.safeParse({ ...base, totalAmount: -100 }).success).toBe(false);
  });
});
