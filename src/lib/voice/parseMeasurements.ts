import { MEASUREMENT_FIELDS, type MeasurementField } from "@/lib/supabase/types";

/**
 * Turns dictated speech into measurement values. Three ways of speaking, mixed
 * freely:
 *   named:    "blouse back length 14, sleeve length 12 point 5, chest 36 and a half"
 *   numbered: "number 4 is 12" (the guide's numbering)
 *   in order: "14, 15, 3" fills the fields one after another from the current
 *             one (field 1 unless started elsewhere); after a named value the
 *             next bare number goes to the following field. "skip"/"next"
 *             moves on without a value.
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
  ["sleeves length", "m04_sleeve_length"],
  ["sleeve lengths", "m04_sleeve_length"],
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
  ["burst", "m11_bust_around"],
  ["waist around", "m12_waist_around"],
  ["waist round", "m12_waist_around"],
  ["waist", "m12_waist_around"],
  ["waste", "m12_waist_around"],
  ["shoulders to apex", "m13_shoulders_to_apex"],
  ["shoulder to apex", "m13_shoulders_to_apex"],
  ["apex", "m13_shoulders_to_apex"],
  ["front length", "m14_front_length"],
  ["full length", "m14_front_length"],
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
  t = t.replace(/(\d+)\s*(?:½|1\/2)/g, "$1.5").replace(/(\d+)\s*(?:¼|1\/4)/g, "$1.25").replace(/(\d+)\s*(?:¾|3\/4)/g, "$1.75");
  t = t.replace(/(\d+)\s+(and\s+)?a\s+half\b/g, "$1.5").replace(/(\d+)\s+and\s+half\b/g, "$1.5");
  t = t.replace(/(\d+)\s+(and\s+)?(a\s+)?quarter\b/g, "$1.25").replace(/(\d+)\s+(and\s+)?3\s+quarters?\b/g, "$1.75");
  t = t.replace(/(\d+)\s+(point|dot)\s+(\d)/g, "$1.$3");
  return t.replace(/\s+/g, " ").trim();
}

function validValue(raw: string): string | null {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v >= 200) return null;
  return String(Math.round(v * 10) / 10);
}

export interface DictationResult {
  values: Partial<Record<MeasurementField, string>>;
  /** Index (0-based) of the field the next bare number would fill. */
  nextIndex: number;
}

type Token = { pos: number; end: number } & ({ kind: "field"; field: MeasurementField } | { kind: "number"; raw: string } | { kind: "skip" });

export function parseDictation(text: string, startIndex = 0): DictationResult {
  const t = normaliseSpeech(text);
  const tokens: Token[] = [];
  const taken: boolean[] = new Array(t.length).fill(false);
  const claim = (start: number, end: number) => {
    if (taken.slice(start, end).some(Boolean)) return false;
    for (let i = start; i < end; i++) taken[i] = true;
    return true;
  };

  // "number 4 (is) …", "no 4", "#4": the guide's numbering.
  for (const m of t.matchAll(/\b(?:number|no\.?|#)\s*(\d{1,2})\b(?:\s+(?:is|equals|=))?/g)) {
    const field = MEASUREMENT_FIELDS[Number(m[1]) - 1];
    const start = m.index ?? 0;
    if (field && claim(start, start + m[0].length)) tokens.push({ kind: "field", field, pos: start, end: start + m[0].length });
  }
  // Field names, longest first so "sleeve length" beats a bare "sleeve".
  for (const [alias, field] of [...ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    for (const m of t.matchAll(new RegExp(`\\b${alias.replace(/ /g, "\\s+")}\\b(?:\\s+(?:is|equals|=))?`, "g"))) {
      const start = m.index ?? 0;
      if (claim(start, start + m[0].length)) tokens.push({ kind: "field", field, pos: start, end: start + m[0].length });
    }
  }
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
    const start = m.index ?? 0;
    if (claim(start, start + m[0].length)) tokens.push({ kind: "number", raw: m[0], pos: start, end: start + m[0].length });
  }
  for (const m of t.matchAll(/\b(?:skip|next)\b/g)) {
    const start = m.index ?? 0;
    if (claim(start, start + m[0].length)) tokens.push({ kind: "skip", pos: start, end: start + m[0].length });
  }
  tokens.sort((a, b) => a.pos - b.pos);

  const values: Partial<Record<MeasurementField, string>> = {};
  let cursor = Math.min(Math.max(0, startIndex), MEASUREMENT_FIELDS.length);
  let pending: MeasurementField | null = null;
  for (const tok of tokens) {
    if (tok.kind === "field") {
      pending = tok.field;
    } else if (tok.kind === "skip") {
      cursor = pending ? MEASUREMENT_FIELDS.indexOf(pending) + 1 : cursor + 1;
      pending = null;
    } else {
      const value = validValue(tok.raw);
      const field = pending ?? MEASUREMENT_FIELDS[cursor];
      if (value && field) {
        values[field] = value;
        cursor = MEASUREMENT_FIELDS.indexOf(field) + 1;
      }
      pending = null;
    }
  }
  return { values, nextIndex: Math.min(cursor, MEASUREMENT_FIELDS.length) };
}

/** Named and numbered values only (no in-order filling). */
export function parseMeasurements(text: string): Partial<Record<MeasurementField, string>> {
  return parseDictation(text, MEASUREMENT_FIELDS.length).values;
}
