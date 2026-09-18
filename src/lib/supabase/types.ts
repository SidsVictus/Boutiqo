// Hand-written row types for Phase 1. Regenerate with
// `supabase gen types typescript` once the schema stabilizes in Phase 2+.

export type BoutiqueStatus = "active" | "on_hold" | "disabled";
export type OrderStage = "received" | "cutting" | "stitching" | "ready" | "delivered";
export type EffectiveOrderStage = OrderStage | "overdue";
export type AdminRole = "owner_admin" | "support_admin" | "billing_admin" | "viewer";
export type FileKind = "boutique_logo" | "cloth_photo";
export type UploadStatus = "pending" | "uploaded" | "failed";

export interface Boutique {
  id: string;
  owner_user_id: string | null;
  name: string;
  area: string | null;
  owner_name: string;
  email: string;
  phone: string | null;
  gst_number: string | null;
  category: string;
  status: BoutiqueStatus;
  terms_tnc_accepted: boolean;
  terms_privacy_accepted: boolean;
  terms_accepted_at: string | null;
  order_seq: number;
  logo_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  boutique_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  instagram_handle: string | null;
  customer_since: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  boutique_id: string;
  customer_id: string;
  order_code: string;
  garment_type: string;
  garment_type_other: string | null;
  stage: OrderStage;
  due_date: string;
  total_amount: number;
  advance_amount: number;
  paid: boolean;
  tailor_name: string | null;
  cloth_description: string | null;
  style_notes: string | null;
  cloth_photo_file_id: string | null;
  tracking_token: string;
  created_at: string;
  updated_at: string;
  [measurementColumn: string]: unknown;
}

export interface AdminUser {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FileRow {
  id: string;
  boutique_id: string;
  kind: FileKind;
  order_id: string | null;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  upload_status: UploadStatus;
  created_at: string;
  updated_at: string;
}

export const MEASUREMENT_FIELDS = [
  "m01_blouse_back_length",
  "m02_full_shoulder_width",
  "m03_shoulder_strap",
  "m04_sleeve_length",
  "m05_sleeve_round",
  "m06_arm_round",
  "m07_armhole_around",
  "m08_back_neck_depth",
  "m09_front_neck_depth",
  "m10_chest_around",
  "m11_bust_around",
  "m12_waist_around",
  "m13_shoulders_to_apex",
  "m14_front_length",
] as const;

export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];
