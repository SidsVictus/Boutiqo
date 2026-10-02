import { describe, expect, it } from "vitest";
import { normaliseSpeech, parseMeasurements } from "@/lib/voice/parseMeasurements";

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
