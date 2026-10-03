import { describe, expect, it } from "vitest";
import { normaliseSpeech, parseDictation, parseMeasurements } from "@/lib/voice/parseMeasurements";

describe("normaliseSpeech", () => {
  it("turns spoken numbers into digits", () => {
    expect(normaliseSpeech("Thirty six point five inches")).toBe("36.5");
    expect(normaliseSpeech("fourteen and a half")).toBe("14.5");
    expect(normaliseSpeech("twelve and half")).toBe("12.5");
  });
});

describe("parseMeasurements", () => {
  it("reads several named measurements in one go", () => {
    expect(parseMeasurements("Blouse back length 14, sleeve length 12.5, sleeve round 11, chest 36 and a half, waist thirty")).toEqual({
      m01_blouse_back_length: "14",
      m04_sleeve_length: "12.5",
      m05_sleeve_round: "11",
      m10_chest_around: "36.5",
      m12_waist_around: "30",
    });
  });
  it("prefers the longest name (front neck depth vs front length)", () => {
    expect(parseMeasurements("front neck depth 7 front length 15")).toEqual({ m09_front_neck_depth: "7", m14_front_length: "15" });
    expect(parseMeasurements("shoulders to apex 10, shoulder strap 2.5, full shoulder 14")).toEqual({
      m13_shoulders_to_apex: "10",
      m03_shoulder_strap: "2.5",
      m02_full_shoulder_width: "14",
    });
  });
  it("accepts the guide's numbering", () => {
    expect(parseMeasurements("number 4 is 12, number 14 15.5")).toEqual({ m04_sleeve_length: "12", m14_front_length: "15.5" });
  });
  it("ignores names without a number and impossible values", () => {
    expect(parseMeasurements("chest, waist 450, bust")).toEqual({});
    expect(parseMeasurements("hello there")).toEqual({});
  });
});

describe("parseDictation (guided, in-order dictation)", () => {
  it("fills fields in order from the starting field", () => {
    expect(parseDictation("14 15 3", 0)).toEqual({ values: { m01_blouse_back_length: "14", m02_full_shoulder_width: "15", m03_shoulder_strap: "3" }, nextIndex: 3 });
    expect(parseDictation("twelve, eleven", 3).values).toEqual({ m04_sleeve_length: "12", m05_sleeve_round: "11" });
  });
  it("continues after a named value, and skip moves on", () => {
    expect(parseDictation("chest 36 bust 38 skip 30", 0)).toEqual({
      values: { m10_chest_around: "36", m11_bust_around: "38", m13_shoulders_to_apex: "30" },
      nextIndex: 13,
    });
  });
  it("understands halves and quarters the way recognisers write them", () => {
    expect(parseDictation("14 1/2, 15½, 3 and a quarter, 9 3/4", 0).values).toEqual({
      m01_blouse_back_length: "14.5",
      m02_full_shoulder_width: "15.5",
      m03_shoulder_strap: "3.3",
      m04_sleeve_length: "9.8",
    });
  });
  it("handles 'is' and common mis-hearings", () => {
    expect(parseDictation("sleeve length is 14, waste 30, burst 34", 99).values).toEqual({ m04_sleeve_length: "14", m12_waist_around: "30", m11_bust_around: "34" });
  });
  it("never runs past the last field", () => {
    expect(parseDictation("1 2", 13)).toEqual({ values: { m14_front_length: "1" }, nextIndex: 14 });
  });
});
