// Shared by the auth callback route and the sign-in pages. Pure — no
// Next/Supabase imports — so it's unit-testable.

/** Pages a post-auth `next` parameter may send the user to. Anything else is ignored. */
const ALLOWED_NEXT = new Set(["/owner/reset-password"]);

/** Only same-site, allow-listed paths: never an open redirect. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  const path = next.split(/[?#]/)[0];
  return ALLOWED_NEXT.has(path) ? path : null;
}

export type AccountKind = { kind: "admin"; active: boolean } | { kind: "owner"; status: string } | { kind: "none" };

/** Where a freshly signed-in user lands, by who they turn out to be. */
export function landingPathFor(account: AccountKind): string {
  if (account.kind === "admin") return account.active ? "/admin/dashboard" : "/owner/login?error=suspended";
  if (account.kind === "owner") return account.status === "disabled" ? "/owner/login?error=disabled" : "/owner/dashboard";
  return "/owner/register";
}

/** Human message for the `?error=` codes the callback and guards redirect with. */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth: "Google sign-in was cancelled or didn't complete. Please try again.",
  link: "That sign-in link is invalid or has expired. Please try again.",
  disabled: "This boutique account has been disabled. Contact Boutiqo support.",
  suspended: "This admin account has been suspended.",
  reset_link: "That password reset link is invalid or has expired. Request a new one below.",
};
