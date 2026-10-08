import { describe, expect, it } from "vitest";
import { relativeTime } from "@/components/app/Notifications";

describe("relativeTime", () => {
  const now = new Date(2026, 9, 6, 18, 0);
  it("reads naturally", () => {
    expect(relativeTime(new Date(2026, 9, 6, 17, 59, 40).toISOString(), now)).toBe("just now");
    expect(relativeTime(new Date(2026, 9, 6, 17, 45).toISOString(), now)).toBe("15 min ago");
    expect(relativeTime(new Date(2026, 9, 6, 15, 0).toISOString(), now)).toBe("3 h ago");
    expect(relativeTime(new Date(2026, 9, 5, 20, 0).toISOString(), now)).toBe("Yesterday");
    expect(relativeTime(new Date(2026, 8, 28, 10, 0).toISOString(), now)).toBe("28 Sept");
  });
});
