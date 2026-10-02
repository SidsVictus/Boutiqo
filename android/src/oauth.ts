// Google sign-in bridge between the web app and the shell. Kept free of React
// Native imports so it can be unit-tested with plain Node.
//
// Google blocks OAuth inside embedded WebViews, so the web app (when it finds
// window.BoutiqoShell) doesn't navigate to Google itself. It posts the
// Supabase authorize URL to the shell, which opens it in a secure browser tab
// (Chrome Custom Tab) and waits for Supabase to redirect to the shell's own
// URL (boutiqo://auth-callback, or exp://…/--/auth-callback in Expo Go). The
// resulting code is then handed to the web app's /auth/callback inside the
// WebView, where the PKCE verifier cookie from the start of the flow lives.

export const OAUTH_MESSAGE_TYPE = "boutiqo:oauth";

/** JS run before every page load, exposing the redirect URL the web app must use. */
export function bridgeScript(oauthRedirectUrl: string): string {
  return `window.BoutiqoShell = Object.freeze({ oauthRedirectUrl: ${JSON.stringify(oauthRedirectUrl)} }); true;`;
}

/**
 * The authorize URL to open, if `data` is a well-formed sign-in request sent
 * by a page of the web app itself. Anything else is ignored.
 */
export function parseOAuthRequest(data: string, senderUrl: string, appOrigin: string): string | null {
  if (senderUrl !== appOrigin && !senderUrl.startsWith(`${appOrigin}/`)) return null;
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!message || typeof message !== "object") return null;
  const { type, url } = message as { type?: unknown; url?: unknown };
  if (type !== OAUTH_MESSAGE_TYPE || typeof url !== "string") return null;
  return isSupabaseAuthorizeUrl(url) ? url : null;
}

/** Supabase Auth's OAuth start endpoint (…/auth/v1/authorize), over HTTPS only. */
export function isSupabaseAuthorizeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.pathname.endsWith("/auth/v1/authorize");
  } catch {
    return false;
  }
}

/**
 * The shell, not the web page, decides where Supabase sends the user back to:
 * its own URL, so the sign-in tab always returns to the app. The PKCE
 * challenge in the URL is untouched, so the code still only works with the
 * verifier cookie in the app's WebView.
 */
export function withAppRedirect(authorizeUrl: string, appRedirectUrl: string): string {
  const url = new URL(authorizeUrl);
  url.searchParams.set("redirect_to", appRedirectUrl);
  return url.toString();
}

/**
 * Where to send the WebView after the sign-in tab returns: the web app's
 * callback with the code, or its login page with an error.
 */
export function callbackUrlFor(redirectedTo: string, appOrigin: string): string {
  let params: URLSearchParams;
  try {
    const url = new URL(redirectedTo);
    // PKCE puts the code in the query; errors may come in the fragment.
    params = new URLSearchParams(url.search);
    new URLSearchParams(url.hash.replace(/^#/, "")).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  } catch {
    return `${appOrigin}/owner/login?error=oauth`;
  }
  const code = params.get("code");
  if (code && !params.get("error")) return `${appOrigin}/auth/callback?code=${encodeURIComponent(code)}`;
  return `${appOrigin}/owner/login?error=oauth`;
}
