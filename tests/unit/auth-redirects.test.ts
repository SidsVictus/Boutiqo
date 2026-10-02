import { describe, expect, it } from "vitest";
import { landingPathFor, safeNextPath } from "@/lib/auth/redirects";

describe("safeNextPath", () => {
  it("allows only allow-listed same-site paths", () => {
    expect(safeNextPath("/owner/reset-password")).toBe("/owner/reset-password");
    expect(safeNextPath("/owner/reset-password?x=1")).toBe("/owner/reset-password");
  });
  it("rejects open redirects and anything else", () => {
    for (const bad of [null, "", "https://evil.example/", "//evil.example/owner/reset-password", "/\\evil.example", "/owner/dashboard", "owner/reset-password"]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});

describe("landingPathFor", () => {
  it("routes each kind of account", () => {
    expect(landingPathFor({ kind: "none" })).toBe("/owner/register");
    expect(landingPathFor({ kind: "owner", status: "active" })).toBe("/owner/dashboard");
    expect(landingPathFor({ kind: "owner", status: "on_hold" })).toBe("/owner/dashboard");
    expect(landingPathFor({ kind: "owner", status: "disabled" })).toBe("/owner/login?error=disabled");
    expect(landingPathFor({ kind: "admin", active: true })).toBe("/admin/dashboard");
    expect(landingPathFor({ kind: "admin", active: false })).toBe("/owner/login?error=suspended");
  });
});
