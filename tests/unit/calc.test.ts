import { describe, expect, it } from "vitest";
import { loadBand } from "@/lib/calc/calendarLoad";
import { balance, isOverdue, effectiveStage, isStageBefore, isStageAfter, nextStage } from "@/lib/calc/order";
import { formatMoney, formatShortDate } from "@/lib/calc/format";

describe("loadBand (3-colour thermal scale, capacity 8)", () => {
  it("0-3 is free", () => {
    expect(loadBand(0)).toBe("free");
    expect(loadBand(3)).toBe("free");
  });
  it("4-6 is low work", () => {
    expect(loadBand(4)).toBe("low");
    expect(loadBand(6)).toBe("low");
  });
  it("7+ is too busy", () => {
    expect(loadBand(7)).toBe("busy");
    expect(loadBand(20)).toBe("busy");
  });
});

describe("balance", () => {
  it("total minus advance", () => {
    expect(balance(4500, 2000)).toBe(2500);
  });
  it("never negative", () => {
    expect(balance(100, 100)).toBe(0);
  });
});

describe("isOverdue / effectiveStage — overdue is derived, never stored", () => {
  const today = new Date(2026, 8, 10); // 10 Sep 2026

  it("is overdue when due date has passed and stage isn't ready/delivered", () => {
    expect(isOverdue("cutting", "2026-09-05", today)).toBe(true);
  });
  it("is not overdue when due date is today or future", () => {
    expect(isOverdue("cutting", "2026-09-10", today)).toBe(false);
    expect(isOverdue("cutting", "2026-09-15", today)).toBe(false);
  });
  it("ready/delivered are never overdue regardless of due date", () => {
    expect(isOverdue("ready", "2026-01-01", today)).toBe(false);
    expect(isOverdue("delivered", "2026-01-01", today)).toBe(false);
  });
  it("effectiveStage returns 'overdue' only when derived true", () => {
    expect(effectiveStage("cutting", "2026-09-01", today)).toBe("overdue");
    expect(effectiveStage("cutting", "2026-09-20", today)).toBe("cutting");
  });
});

describe("stage helpers", () => {
  it("isStageBefore / isStageAfter", () => {
    expect(isStageBefore("received", "cutting")).toBe(true);
    expect(isStageAfter("delivered", "received")).toBe(true);
    expect(isStageBefore("delivered", "received")).toBe(false);
  });
  it("nextStage", () => {
    expect(nextStage("received")).toBe("cutting");
    expect(nextStage("delivered")).toBeNull();
  });
});

describe("formatting", () => {
  it("formatMoney uses en-IN grouping with a rupee sign", () => {
    expect(formatMoney(4500)).toBe("₹4,500");
    expect(formatMoney(150000)).toBe("₹1,50,000");
  });
  it("formatShortDate reads '14 Sep', never '09/14'", () => {
    expect(formatShortDate("2026-09-14")).toBe("14 Sept");
  });
});
