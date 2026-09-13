import type { AdminUser, Boutique, Customer, FileRow, Order } from "@/lib/supabase/types";

/**
 * In-memory mock backing store — the ONLY place Phase 2 keeps state. Every
 * data-layer module (boutiques.ts, orders.ts, ...) reads/writes through here,
 * never a component. Resets on reload; there is no persistence and no real
 * network call anywhere in this file. See docs/phase2-report.md "Mock data
 * layer" for how Phase 3 replaces this.
 */

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function iso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const boutiques: Boutique[] = [
  {
    id: "b1",
    owner_user_id: "u_owner1",
    name: "Meera Boutique",
    area: "Banjara Hills",
    owner_name: "Meera Nandini",
    email: "owner1@example-fixture.test",
    phone: "98490 76543",
    gst_number: "36AAKCM1234P1Z9",
    category: "Ladies tailoring & boutique",
    status: "active",
    terms_tnc_accepted: true,
    terms_privacy_accepted: true,
    terms_accepted_at: iso(-200),
    order_seq: 6,
    logo_file_id: null,
    created_at: iso(-200),
    updated_at: iso(-1),
  },
  {
    id: "b2",
    owner_user_id: "u_owner2",
    name: "Silk Story",
    area: "Jubilee Hills",
    owner_name: "Fathima Begum",
    email: "owner2@example-fixture.test",
    phone: "90300 11221",
    gst_number: "36AACFS8821K1Z2",
    category: "Designer boutique",
    status: "on_hold",
    terms_tnc_accepted: true,
    terms_privacy_accepted: true,
    terms_accepted_at: iso(-150),
    order_seq: 1,
    logo_file_id: null,
    created_at: iso(-150),
    updated_at: iso(-3),
  },
  {
    id: "b3",
    owner_user_id: "u_owner3",
    name: "Stitch Lane",
    area: "Kondapur",
    owner_name: "Anitha Kumari",
    email: "owner3@example-fixture.test",
    phone: "99490 55102",
    gst_number: null,
    category: "Ladies tailoring",
    status: "disabled",
    terms_tnc_accepted: true,
    terms_privacy_accepted: true,
    terms_accepted_at: iso(-90),
    order_seq: 2,
    logo_file_id: null,
    created_at: iso(-90),
    updated_at: iso(-30),
  },
  {
    id: "b4",
    owner_user_id: "u_owner4",
    name: "Anvi Designer Studio",
    area: "Madhapur",
    owner_name: "Anvi Reddy",
    email: "owner4@example-fixture.test",
    phone: "70950 30012",
    gst_number: "36AAGCA4410M1Z7",
    category: "Bridal & occasion wear",
    status: "active",
    terms_tnc_accepted: true,
    terms_privacy_accepted: true,
    terms_accepted_at: iso(-60),
    order_seq: 3,
    logo_file_id: null,
    created_at: iso(-60),
    updated_at: iso(-2),
  },
  {
    id: "b5",
    owner_user_id: "u_owner5",
    name: "Rangoli Tailors",
    area: "Mehdipatnam",
    owner_name: "Shahnaz Parveen",
    email: "owner5@example-fixture.test",
    phone: "88010 22114",
    gst_number: null,
    category: "Ladies tailoring",
    status: "active",
    terms_tnc_accepted: true,
    terms_privacy_accepted: true,
    terms_accepted_at: iso(-40),
    order_seq: 1,
    logo_file_id: null,
    created_at: iso(-40),
    updated_at: iso(-4),
  },
];

export const customers: Customer[] = [
  { id: "c1", boutique_id: "b1", name: "Aisha Fatima", phone: "98490 12345", address: "12-4-77, Road No. 3, Banjara Hills", instagram_handle: "@aisha.drapes", customer_since: daysFromToday(-190), created_at: iso(-190), updated_at: iso(-190) },
  { id: "c2", boutique_id: "b1", name: "Meghana Reddy", phone: "90000 45678", address: "Flat 402, Aditya Enclave, Jubilee Hills", instagram_handle: "@meghana_r", customer_since: daysFromToday(-160), created_at: iso(-160), updated_at: iso(-160) },
  { id: "c3", boutique_id: "b1", name: "Sridevi Rao", phone: "99590 33211", address: "8-2-120, Banjara Hills", instagram_handle: null, customer_since: daysFromToday(-140), created_at: iso(-140), updated_at: iso(-140) },
  { id: "c4", boutique_id: "b1", name: "Nikhat Parveen", phone: "70930 55412", address: "Nanal Nagar, Tolichowki", instagram_handle: "@nikhat.stitch", customer_since: daysFromToday(-100), created_at: iso(-100), updated_at: iso(-100) },
  { id: "c5", boutique_id: "b2", name: "Zoya Khan", phone: "88860 21100", address: "Humayun Nagar, Mehdipatnam", instagram_handle: "@zoya.k", customer_since: daysFromToday(-80), created_at: iso(-80), updated_at: iso(-80) },
  { id: "c6", boutique_id: "b4", name: "Ramya Iyer", phone: "93910 88221", address: "Ayyappa Society, Madhapur", instagram_handle: "@ramya.iyer", customer_since: daysFromToday(-30), created_at: iso(-30), updated_at: iso(-30) },
];

function measurements(overrides: Record<string, number> = {}): Record<string, number | null> {
  const base: Record<string, number | null> = {
    m01_blouse_back_length: null,
    m02_full_shoulder_width: null,
    m03_shoulder_strap: null,
    m04_sleeve_length: null,
    m05_sleeve_round: null,
    m06_arm_round: null,
    m07_armhole_around: null,
    m08_back_neck_depth: null,
    m09_front_neck_depth: null,
    m10_chest_around: null,
    m11_bust_around: null,
    m12_waist_around: null,
    m13_shoulders_to_apex: null,
    m14_front_length: null,
  };
  return { ...base, ...overrides };
}

const fullMeasurements = measurements({
  m01_blouse_back_length: 15.0,
  m02_full_shoulder_width: 14.5,
  m03_shoulder_strap: 4.5,
  m04_sleeve_length: 18.0,
  m05_sleeve_round: 11.0,
  m06_arm_round: 12.5,
  m07_armhole_around: 16.0,
  m08_back_neck_depth: 7.0,
  m09_front_neck_depth: 8.0,
  m10_chest_around: 34.0,
  m11_bust_around: 36.0,
  m12_waist_around: 30.5,
  m13_shoulders_to_apex: 10.0,
  m14_front_length: 14.0,
});

export const orders: Order[] = [
  {
    id: "o1",
    boutique_id: "b1",
    customer_id: "c1",
    order_code: "BQ-1042",
    garment_type: "Lehenga blouse",
    garment_type_other: null,
    stage: "stitching",
    due_date: daysFromToday(4),
    total_amount: 4500,
    advance_amount: 2000,
    paid: false,
    tailor_name: "Sarita",
    cloth_description: "Wine raw silk, 1.5 m",
    style_notes: "Sweetheart neck, cap sleeve, hook back.",
    cloth_photo_file_id: "f1",
    // Fixed (not random) so the demo/tests can link to it directly — every
    // other order below keeps a real random token, matching the real schema's
    // entropy requirement.
    tracking_token: "demo00000000000000000000000000000000000000000000000000000001",
    created_at: iso(-6),
    updated_at: iso(-1),
    ...fullMeasurements,
  } as Order,
  {
    id: "o2",
    boutique_id: "b1",
    customer_id: "c2",
    order_code: "BQ-1041",
    garment_type: "Anarkali kurta",
    garment_type_other: null,
    stage: "cutting",
    due_date: daysFromToday(2),
    total_amount: 3200,
    advance_amount: 1000,
    paid: false,
    tailor_name: "Imran",
    cloth_description: "Powder blue chanderi, 3 m",
    style_notes: "Floor length, side slits, churidar sleeve.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-8),
    updated_at: iso(-2),
    ...measurements(),
  } as Order,
  {
    id: "o3",
    boutique_id: "b1",
    customer_id: "c3",
    order_code: "BQ-1039",
    garment_type: "Saree blouse",
    garment_type_other: null,
    stage: "ready",
    due_date: daysFromToday(-1),
    total_amount: 1800,
    advance_amount: 1800,
    paid: true,
    tailor_name: "Sarita",
    cloth_description: "Cotton silk blouse piece",
    style_notes: "Princess cut, elbow sleeve.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-12),
    updated_at: iso(-1),
    ...measurements(),
  } as Order,
  {
    id: "o4",
    boutique_id: "b1",
    customer_id: "c4",
    order_code: "BQ-1038",
    garment_type: "Salwar suit",
    garment_type_other: null,
    stage: "delivered",
    due_date: daysFromToday(-6),
    total_amount: 2400,
    advance_amount: 2400,
    paid: true,
    tailor_name: "Imran",
    cloth_description: "Mustard cotton, 4.5 m",
    style_notes: "Straight kurta, pant salwar.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-20),
    updated_at: iso(-6),
    ...measurements(),
  } as Order,
  {
    id: "o5",
    boutique_id: "b1",
    customer_id: "c1",
    order_code: "BQ-1044",
    garment_type: "Bridal lehenga",
    garment_type_other: null,
    stage: "received",
    due_date: daysFromToday(15),
    total_amount: 6000,
    advance_amount: 2500,
    paid: false,
    tailor_name: "Sarita",
    cloth_description: "Red zardozi panels, 6 m",
    style_notes: "Kalidar, canvas lining, 8 m flare.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-2),
    updated_at: iso(-2),
    ...measurements(),
  } as Order,
  {
    id: "o6",
    boutique_id: "b1",
    customer_id: "c2",
    order_code: "BQ-1040",
    garment_type: "Blouse alteration",
    garment_type_other: null,
    // Overdue-by-derivation: stage is still "cutting" but due_date is in the past.
    stage: "cutting",
    due_date: daysFromToday(-3),
    total_amount: 1200,
    advance_amount: 0,
    paid: false,
    tailor_name: "Rehana",
    cloth_description: "Customer's stitched blouse",
    style_notes: "Take in 1 inch at bust, shorten sleeve.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-10),
    updated_at: iso(-10),
    ...measurements(),
  } as Order,
  {
    id: "o7",
    boutique_id: "b2",
    customer_id: "c5",
    order_code: "BQ-2001",
    garment_type: "Gown",
    garment_type_other: null,
    stage: "stitching",
    due_date: daysFromToday(9),
    total_amount: 5400,
    advance_amount: 2000,
    paid: false,
    tailor_name: "—",
    cloth_description: "Navy georgette, 5 m",
    style_notes: "Fitted bodice, flared skirt.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-5),
    updated_at: iso(-1),
    ...measurements(),
  } as Order,
  {
    id: "o8",
    boutique_id: "b4",
    customer_id: "c6",
    order_code: "BQ-3001",
    garment_type: "Other",
    garment_type_other: "Choli set with dupatta",
    stage: "received",
    due_date: daysFromToday(20),
    total_amount: 3600,
    advance_amount: 1500,
    paid: false,
    tailor_name: "—",
    cloth_description: "Teal satin, 4 m",
    style_notes: "Padded top, gathered skirt with belt.",
    cloth_photo_file_id: null,
    tracking_token: randomToken(),
    created_at: iso(-1),
    updated_at: iso(-1),
    ...measurements(),
  } as Order,
];

export const files: FileRow[] = [
  {
    id: "f1",
    boutique_id: "b1",
    kind: "cloth_photo",
    order_id: "o1",
    object_key: "mock/boutiques/b1/orders/o1/cloth/fixture.jpg",
    mime_type: "image/jpeg",
    size_bytes: 850_000,
    upload_status: "uploaded",
    created_at: iso(-6),
    updated_at: iso(-6),
  },
];

export const admins: AdminUser[] = [
  { id: "a1", user_id: "u_admin1", name: "Rahul Varma", email: "admin.owner@example-fixture.test", role: "owner_admin", active: true, created_at: iso(-300), updated_at: iso(-300) },
  { id: "a2", user_id: "u_admin2", name: "Priya Nayak", email: "admin.support@example-fixture.test", role: "support_admin", active: true, created_at: iso(-300), updated_at: iso(-300) },
  { id: "a3", user_id: "u_admin3", name: "Aditya Rao", email: "admin.billing@example-fixture.test", role: "billing_admin", active: true, created_at: iso(-300), updated_at: iso(-300) },
  { id: "a4", user_id: "u_admin4", name: "Sneha Kapoor", email: "admin.viewer@example-fixture.test", role: "viewer", active: false, created_at: iso(-300), updated_at: iso(-300) },
];

/** Per-day order counts for the load calendar — seeded to hit all 3 thermal bands. */
export const calendarLoadByDate: Record<string, number> = {
  [daysFromToday(2)]: 1,
  [daysFromToday(4)]: 3,
  [daysFromToday(6)]: 2,
  [daysFromToday(8)]: 4,
  [daysFromToday(9)]: 1,
  [daysFromToday(10)]: 5,
  [daysFromToday(12)]: 8,
  [daysFromToday(13)]: 2,
  [daysFromToday(15)]: 3,
  [daysFromToday(16)]: 6,
  [daysFromToday(17)]: 2,
  [daysFromToday(19)]: 1,
  [daysFromToday(20)]: 4,
  [daysFromToday(22)]: 2,
  [daysFromToday(23)]: 9,
  [daysFromToday(24)]: 3,
  [daysFromToday(26)]: 2,
  [daysFromToday(27)]: 1,
  [daysFromToday(29)]: 4,
};

// ---------------------------------------------------------------------------
// Simulated network conditions — every data-layer function should route reads/
// writes through `simulate()` so latency/error states are real code paths a
// component can hit during development/testing, not just styled in isolation.
// ---------------------------------------------------------------------------
let forcedFailure = false;

/** Test/dev hook: next call(s) to any data-layer function will reject. */
export function setForceFailure(on: boolean) {
  forcedFailure = on;
}

export function isForcingFailure() {
  return forcedFailure;
}

export class MockApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function simulate<T>(fn: () => T, opts: { latencyMs?: number; failMessage?: string } = {}): Promise<T> {
  const latency = opts.latencyMs ?? 220;
  await new Promise((resolve) => setTimeout(resolve, latency));
  if (forcedFailure) {
    throw new MockApiError("simulated_failure", opts.failMessage || "Something went wrong. Try again.");
  }
  return fn();
}
