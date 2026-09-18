import { MEASUREMENT_FIELDS, type MeasurementField } from "@/lib/supabase/types";

/** The 14-field measurement guide, numbered exactly as in
 * CLAUDE_CODE_HANDOFF.md's "changes after first implementation" section —
 * points 1–8 are on measure-back.png, 9–14 on measure-front.png. */
export const MEASUREMENT_LABELS: Record<MeasurementField, { n: number; label: string }> = {
  m01_blouse_back_length: { n: 1, label: "Blouse back length" },
  m02_full_shoulder_width: { n: 2, label: "Full shoulder width" },
  m03_shoulder_strap: { n: 3, label: "Shoulder strap" },
  m04_sleeve_length: { n: 4, label: "Sleeve length" },
  m05_sleeve_round: { n: 5, label: "Sleeve round" },
  m06_arm_round: { n: 6, label: "Arm round" },
  m07_armhole_around: { n: 7, label: "Armhole around" },
  m08_back_neck_depth: { n: 8, label: "Back neck depth" },
  m09_front_neck_depth: { n: 9, label: "Front neck depth" },
  m10_chest_around: { n: 10, label: "Chest around" },
  m11_bust_around: { n: 11, label: "Bust around" },
  m12_waist_around: { n: 12, label: "Waist around" },
  m13_shoulders_to_apex: { n: 13, label: "Shoulders to apex" },
  m14_front_length: { n: 14, label: "Front length" },
};

export { MEASUREMENT_FIELDS };
