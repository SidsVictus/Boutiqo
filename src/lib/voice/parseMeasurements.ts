import { MEASUREMENT_FIELDS, type MeasurementField } from "@/lib/supabase/types";

/**
 * Turns dictated speech into measurement values, e.g.
 *   "blouse back length 14, sleeve length 12 point 5, chest 36 and a half"
 *   "number 4 is 12" (by the guide's numbering)
 * Pure (no browser APIs) so it's unit-tested in tests/unit.
 */

// Spoken names for each field, longest first within the table so "sleeve
// length" wins over a bare "sleeve".
const ALIASES: [string, MeasurementField][] = [
  ["blouse back length", "m01_blouse_back_length"],
  ["back length", "m01_blouse_back_length"],
  ["full shoulder width", "m02_full_shoulder_width"],
  ["full shoulder", "m02_full_shoulder_width"],
  ["shoulder width", "m02_full_shoulder_width"],
  ["shoulder strap", "m03_shoulder_strap"],
  ["strap", "m03_shoulder_strap"],
  ["sleeve length", "m04_sleeve_length"],
  ["sleeve round", "m05_sleeve_round"],
  ["sleeve around", "m05_sleeve_round"],
  ["arm round", "m06_arm_round"],
  ["arm around", "m06_arm_round"],
  ["armhole around", "m07_armhole_around"],
  ["armhole round", "m07_armhole_around"],
  ["arm hole", "m07_armhole_around"],
  ["armhole", "m07_armhole_around"],
  ["back neck depth", "m08_back_neck_depth"],
  ["back neck", "m08_back_neck_depth"],
  ["front neck depth", "m09_front_neck_depth"],
  ["front neck", "m09_front_neck_depth"],
  ["chest around", "m10_chest_around"],
  ["chest round", "m10_chest_around"],
  ["chest", "m10_chest_around"],
  ["bust around", "m11_bust_around"],
  ["bust round", "m11_bust_around"],
  ["bust", "m11_bust_around"],
  ["waist around", "m12_waist_around"],
  ["waist round", "m12_waist_around"],
  ["waist", "m12_waist_around"],
  ["shoulders to apex", "m13_shoulders_to_apex"],
  ["shoulder to apex", "m13_shoulders_to_apex"],
  ["apex", "m13_shoulders_to_apex"],
  ["front length", "m14_front_length"],
];

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Lower-case, digits instead of number words, "." for "point"/"and a half". */
export function normaliseSpeech(text: string): string {
  let t = ` ${text.toLowerCase()} `.replace(/[,;:!?]/g, " ").replace(/-/g, " ");
  t = t.replace(/\b(inches|inch|ins)\b/g, " ");
  // "thirty six" → "36"
  t = t.replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})\\s+(${Object.keys(ONES).filter((w) => ONES[w] > 0 && ONES[w] < 10).join("|")})\\b`, "g"), (_m, a: string, b: string) => String(TENS[a] + ONES[b]));
  t = t.replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})\\b`, "g"), (m) => String(TENS[m]));
  t = t.replace(new RegExp(`\\b(${Object.keys(ONES).join("|")})\\b`, "g"), (m) => String(ONES[m]));
  t = t.replace(/(\d+)\s+(and\s+)?a\s+half\b/g, "$1.5").replace(/(\d+)\s+and\s+half\b/g, "$1.5");
  t = t.replace(/(\d+)\s+(point|dot)\s+(\d)/g, "$1.$3");
  return t.replace(/\s+/g, " ").trim();
}

const NUMBER = /\d+(?:\.\d+)?/;

function validValue(raw: string): string | null {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v >= 200) return null;
  return String(Math.round(v * 10) / 10);
}

export function parseMeasurements(text: string): Partial<Record<MeasurementField, string>> {
  const t = normaliseSpeech(text);
  const out: Partial<Record<MeasurementField, string>> = {};

  // "number 4 is 12", "no 4 12"
  for (const m of t.matchAll(/\b(?:number|no\.?|#)\s*(\d{1,2})\s+(?:is\s+|equals\s+|=\s*)?(\d+(?:\.\d+)?)/g)) {
    const field = MEASUREMENT_FIELDS[Number(m[1]) - 1];
    const value = validValue(m[2]);
    if (field && value) out[field] = value;
  }

  // Named fields: find every alias (longest match wins where they overlap),
  // then take the first number between it and the next alias.
  const taken: boolean[] = new Array(t.length).fill(false);
  const hits: { start: number; end: number; field: MeasurementField }[] = [];
  const byLength = [...ALIASES].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, field] of byLength) {
    const re = new RegExp(`\\b${alias.replace(/ /g, "\\s+")}\\b`, "g");
    for (const m of t.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      hits.push({ start, end, field });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  hits.forEach((hit, i) => {
    const segment = t.slice(hit.end, hits[i + 1]?.start ?? t.length);
    const num = segment.match(NUMBER);
    const value = num ? validValue(num[0]) : null;
    if (value) out[hit.field] = value;
  });
  return out;
}
