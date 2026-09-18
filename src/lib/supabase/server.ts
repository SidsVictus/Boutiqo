import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Server-side Supabase client scoped to the caller's own session (RLS applies
 * exactly as it would for that user — this is NOT a privileged client).
 *
 * Reads the session from cookies (normal browser flow) by default. Route
 * handlers may also be called with a bare `Authorization: Bearer <access_token>`
 * header (used by API-level tests and any future non-browser client); when
 * present it is used instead of cookies, forwarded as-is to PostgREST/Auth so
 * RLS evaluates as that user.
 */
export async function createSupabaseRouteClient(request?: Request) {
  const bearer = request?.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];

  if (bearer) {
    return createSupabaseJsClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — cookies can't be written there.
          // Middleware is responsible for refreshing the session in that case.
        }
      },
    },
  });
}
