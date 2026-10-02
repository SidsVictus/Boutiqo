// Everything in this file is bundled into the APK and must be treated as
// public. Only the web app's public URL lives here — never Supabase
// service-role keys, R2 credentials or any other secret. The shell needs no
// Supabase/R2 configuration at all: the web app it loads already talks to its
// own backend.

/** Production web app. Used when EXPO_PUBLIC_WEB_APP_URL is not set. */
export const PRODUCTION_WEB_APP_URL = "https://boutiqoo.netlify.app";

export type WebAppConfig = { ok: true; url: string; origin: string } | { ok: false; reason: string };

/**
 * Resolves and validates the web app URL. `allowInsecure` is only true in
 * development (`__DEV__`), so a local `http://<lan-ip>:3000` Next.js server
 * can be used from Expo Go, while every release build is HTTPS-only.
 */
export function resolveWebAppConfig(raw: string | undefined, allowInsecure: boolean): WebAppConfig {
  const value = raw?.trim() || PRODUCTION_WEB_APP_URL;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: `EXPO_PUBLIC_WEB_APP_URL is not a valid URL: ${value}` };
  }
  if (parsed.protocol !== "https:" && !(allowInsecure && parsed.protocol === "http:")) {
    return { ok: false, reason: "EXPO_PUBLIC_WEB_APP_URL must use https:// in release builds." };
  }
  return { ok: true, url: value.replace(/\/+$/, ""), origin: parsed.origin };
}

/** Initial page load taking longer than this shows the retry screen. */
export const INITIAL_LOAD_TIMEOUT_MS = 30_000;
