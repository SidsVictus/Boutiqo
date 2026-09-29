// Decides where a top-level navigation inside the WebView should go. Kept free
// of React Native imports so it can be unit-tested with plain Node.

export type NavigationDecision =
  /** Same origin as the web app: load it inside the WebView. */
  | { kind: "internal" }
  /** Hand to Android (browser, WhatsApp, dialer, mail…). */
  | { kind: "external"; url: string }
  /** Drop it silently. */
  | { kind: "block" };

// Schemes Android apps commonly register for. Anything not listed (javascript:,
// file:, content:, custom app schemes…) is blocked rather than forwarded.
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "tel:", "mailto:", "sms:", "smsto:", "whatsapp:", "geo:", "upi:", "market:"]);

// Loaded in place by the WebView itself (e.g. object URLs for image previews).
const INLINE_SCHEMES = new Set(["about:", "blob:", "data:"]);

export function classifyNavigation(rawUrl: string, appOrigin: string): NavigationDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "block" };
  }

  if (url.origin === appOrigin) return { kind: "internal" };
  if (INLINE_SCHEMES.has(url.protocol)) return { kind: "internal" };

  // Chrome-style intent links (e.g. from some share widgets). React Native's
  // Linking can't launch them directly, so fall back to their web URL.
  if (url.protocol === "intent:") {
    const fallback = /;S\.browser_fallback_url=([^;]+);/.exec(rawUrl)?.[1];
    if (!fallback) return { kind: "block" };
    const decoded = safeDecode(fallback);
    return decoded && /^https?:\/\//i.test(decoded) ? { kind: "external", url: decoded } : { kind: "block" };
  }

  if (EXTERNAL_SCHEMES.has(url.protocol)) return { kind: "external", url: rawUrl };
  return { kind: "block" };
}

/** Origin + path only: query strings can carry tokens and must never be logged. */
export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    // /track/<token> is a no-login customer link; the token is a credential.
    const path = url.pathname.replace(/^\/track\/[^/]+/, "/track/<token>");
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return "<unparseable url>";
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
