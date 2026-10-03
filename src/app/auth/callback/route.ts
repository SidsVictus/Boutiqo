import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { landingPathFor, safeNextPath, type AccountKind } from "@/lib/auth/redirects";
import { logSecurityEvent } from "@/lib/log";
import { claimAdminRow } from "@/lib/auth/adminRoster";

/**
 * Single landing point for every redirect-based auth flow:
 * - Google OAuth (`?code=`, PKCE — the verifier cookie was set by the browser
 *   client that started the flow, so this must run in that same browser/WebView);
 * - email links: signup confirmation and password reset, either as `?code=`
 *   (Supabase's default email templates) or `?token_hash=&type=` (the
 *   recommended templates, which also work when the link is opened in a
 *   different browser than the one that asked for it).
 *
 * It exchanges the credential for a session cookie here, server-side, then
 * redirects to where this user belongs. `?established=1` (from /auth/confirm,
 * which has already stored a session from an emailed link) skips the exchange
 * and only does the routing; it carries no credential, so it can't sign
 * anyone in.
 *
 * Previously Google sign-in returned straight to /owner/register, which (with
 * no in-memory signup draft after a full-page redirect) bounced the user back
 * to /owner/signup: the "Continue with Google just reloads the page" bug.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = url.origin;
  const next = safeNextPath(url.searchParams.get("next"));
  const isRecovery = next === "/owner/reset-password" || url.searchParams.get("type") === "recovery";
  const failPath = isRecovery ? "/owner/forgot-password?error=reset_link" : `/owner/login?error=${url.searchParams.get("code") || url.searchParams.get("established") ? "link" : "oauth"}`;

  const supabase = await createSupabaseRouteClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let error: { message: string } | null = null;
  if (url.searchParams.get("error")) {
    error = { message: url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "oauth_error" };
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else if (url.searchParams.get("established") === "1") {
    // Session already in the cookies; the getUser() check below decides.
  } else {
    error = { message: "missing_credential" };
  }

  if (error) {
    logSecurityEvent("auth_callback_failed", { reason: error.message, recovery: isRecovery });
    return NextResponse.redirect(new URL(failPath, origin));
  }

  if (isRecovery) return NextResponse.redirect(new URL("/owner/reset-password", origin));

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(failPath, origin));

  // A listed super admin signing in with Google gets their admin row linked
  // before routing (see lib/auth/adminRoster.ts).
  await claimAdminRow(user.id);

  let account: AccountKind = { kind: "none" };
  const { data: adminRows } = await supabase.rpc("current_admin_self");
  const admin = Array.isArray(adminRows) ? (adminRows[0] as { active: boolean } | undefined) : undefined;
  if (admin) {
    account = { kind: "admin", active: admin.active };
  } else {
    const { data: boutique } = await supabase.from("boutiques").select("status").eq("owner_user_id", user.id).maybeSingle();
    if (boutique) account = { kind: "owner", status: boutique.status };
  }

  // Same rule as POST /api/auth/login: a disabled boutique (or suspended
  // admin) never keeps a session.
  if (account.kind === "owner" && account.status === "disabled") {
    await supabase.auth.signOut();
    logSecurityEvent("account_disabled_login_blocked", { userId: user.id, via: "auth_callback" });
  } else if (account.kind === "admin" && !account.active) {
    await supabase.auth.signOut();
    logSecurityEvent("admin_suspended_login_blocked", { userId: user.id, via: "auth_callback" });
  }

  return NextResponse.redirect(new URL(landingPathFor(account), origin));
}
