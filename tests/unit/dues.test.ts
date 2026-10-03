import { describe, expect, it } from "vitest";
import { groupByDueDate, matchesView, outstandingTotal, parseDuesView } from "@/lib/calc/dues";
import { localDateKey } from "@/lib/calc/format";
import type { Order } from "@/lib/supabase/types";

const order = (o: Partial<Order>): Order => ({ id: Math.random().toString(), order_code: "BQ-0001", stage: "received", paid: false, total_amount: 100, advance_amount: 0, due_date: "2099-01-01", ...o }) as Order;
const today = new Date(2026, 9, 3);

describe("dues", () => {
  it("filters by view", () => {
    const overdue = order({ due_date: "2026-10-01" });
    const ready = order({ due_date: "2026-10-01", stage: "ready" });
    const done = order({ stage: "delivered", paid: true });
    expect(matchesView(overdue, "overdue", today)).toBe(true);
    expect(matchesView(ready, "overdue", today)).toBe(false); // ready is never overdue
    expect(matchesView(ready, "ready", today)).toBe(true);
    expect(matchesView(done, "open", today)).toBe(false);
    expect(matchesView(done, "unpaid", today)).toBe(false);
    expect(matchesView(done, "all", today)).toBe(true);
  });
  it("groups by date, earliest first, and totals unpaid balances", () => {
    const groups = groupByDueDate([order({ due_date: "2026-10-09" }), order({ due_date: "2026-10-02" }), order({ due_date: "2026-10-09" })]);
    expect(groups.map((g) => [g.date, g.orders.length])).toEqual([["2026-10-02", 1], ["2026-10-09", 2]]);
    expect(outstandingTotal([order({ total_amount: 1000, advance_amount: 200 }), order({ paid: true })])).toBe(800);
  });
  it("defaults unknown views to open", () => {
    expect(parseDuesView("overdue")).toBe("overdue");
    expect(parseDuesView("nope")).toBe("open");
    expect(parseDuesView(null)).toBe("open");
  });
  it("uses the local calendar day, not the UTC one", () => {
    expect(localDateKey(new Date(2026, 9, 3, 0, 30))).toBe("2026-10-03");
  });
});
