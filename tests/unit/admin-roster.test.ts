import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { hasVerifiedGoogleIdentity, SUPER_ADMINS, PLACEHOLDER_ADMIN_EMAILS } = await import("@/lib/auth/adminRoster");

const identity = (provider: string, data: Record<string, unknown>) => ({ provider, identity_data: data }) as never;

describe("admin roster", () => {
  it("lists the real team and no placeholders", () => {
    expect(SUPER_ADMINS.map((a) => a.email)).toEqual(["sidsvictus@gmail.com", "help.boutiqo@gmail.com"]);
    expect(SUPER_ADMINS.some((a) => PLACEHOLDER_ADMIN_EMAILS.includes(a.email))).toBe(false);
  });
  it("only a verified Google identity for that exact email counts", () => {
    const email = "sidsvictus@gmail.com";
    expect(hasVerifiedGoogleIdentity({ identities: [identity("google", { email: "SidsVictus@gmail.com", email_verified: true })] }, email)).toBe(true);
    expect(hasVerifiedGoogleIdentity({ identities: [identity("google", { email, email_verified: false })] }, email)).toBe(false);
    expect(hasVerifiedGoogleIdentity({ identities: [identity("email", { email, email_verified: true })] }, email)).toBe(false);
    expect(hasVerifiedGoogleIdentity({ identities: [identity("google", { email: "other@gmail.com", email_verified: true })] }, email)).toBe(false);
    expect(hasVerifiedGoogleIdentity({ identities: undefined }, email)).toBe(false);
  });
});
