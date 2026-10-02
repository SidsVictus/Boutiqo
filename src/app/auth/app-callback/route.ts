import { NextResponse, type NextRequest } from "next/server";

/**
 * Hand-off for Google sign-in started in the Android app.
 *
 * Supabase only redirects to URLs on its allow-list, and matching custom
 * schemes (boutiqo://, Expo Go's exp://<lan-ip>:8081/--/…) proved unreliable:
 * when it didn't match, Supabase fell back to the Site URL and the user ended
 * up signed in on the website inside the sign-in tab. So the app asks
 * Supabase to return here instead, an https URL that's always allowed, with
 * its own return URL in `?app=`. This route forwards the result (?code= or
 * ?error=) to that URL, which brings the user back into the app; the app then
 * completes sign-in at /auth/callback in its WebView.
 *
 * Only the app's own schemes are accepted as targets, so this can't be used
 * as an open redirect. The code alone is useless anyway: exchanging it needs
 * the PKCE verifier cookie that only the app's WebView holds.
 */
const APP_URL = /^(boutiqo:\/\/|exp:\/\/)/i;

export function GET(request: NextRequest) {
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const app = params.get("app");
  params.delete("app");
  if (!app || !APP_URL.test(app)) {
    return NextResponse.redirect(new URL("/owner/login?error=oauth", request.nextUrl.origin));
  }
  const query = params.toString();
  const target = query ? `${app}${app.includes("?") ? "&" : "?"}${query}` : app;
  // A plain 302 keeps this inside the redirect chain that started with the
  // user's tap on Google, so the browser tab hands the custom scheme to Android.
  return new NextResponse(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
}
