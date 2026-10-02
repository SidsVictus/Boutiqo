"use client";

import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * A throwaway browser client using the *implicit* flow, only for requests
 * whose result arrives as an emailed link: password reset and signup
 * confirmation.
 *
 * The main client uses PKCE, which makes Supabase's default email links work
 * only in the browser that asked for them (the code verifier lives in that
 * browser's cookies). Asking from the Android app or one browser and opening
 * the email in Gmail/Chrome then fails with "link invalid or expired".
 * Requested this way, the default link instead returns a session in the URL
 * fragment, which /auth/confirm hands to the main client: it works in any
 * browser, on any device, with no email template changes.
 */
export function createImplicitClient() {
  return createSupabaseJsClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
