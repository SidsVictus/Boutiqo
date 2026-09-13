import { describe, expect, it } from "vitest";
import { computeLoadByDate } from "@/lib/calc/calendarLoad";
import { ApiError } from "@/lib/data/store";

/**
 * Phase 3: the previous version of this file tested Phase 2's in-memory mock
 * array logic (sequential order codes, on_hold/disabled rejection, the admin
 * sub-role status matrix) directly. That logic now lives server-side in
 * Postgres (already covered by Phase 1's RLS test suite — see
 * docs/phase1-report.md §5) — the client-side modules in src/lib/data/ are
 * now thin proxies to real Supabase calls / Phase 1's API routes, so there's
 * no meaningful client-side logic left to unit-test there without a live
 * network connection. What's left and still worth testing offline:
 */

describe("computeLoadByDate", () => {
  it("groups orders by due_date into counts", () => {
    const counts = computeLoadByDate([{ due_date: "2026-09-10" }, { due_date: "2026-09-10" }, { due_date: "2026-09-12" }]);
    expect(counts).toEqual({ "2026-09-10": 2, "2026-09-12": 1 });
  });

  it("returns an empty object for no orders", () => {
    expect(computeLoadByDate([])).toEqual({});
  });
});

describe("ApiError", () => {
  it("carries a code and message, and is a real Error", () => {
    const err = new ApiError("forbidden", "Not allowed");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("forbidden");
    expect(err.message).toBe("Not allowed");
  });
});
