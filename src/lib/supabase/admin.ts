import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Privileged client using the service-role key. Bypasses RLS entirely.
 *
 * Server-only, and only for the small set of operations that must run before
 * a boutique row (and therefore RLS ownership) exists:
 *  - owner registration (creating the boutiques row right after auth signup)
 *  - admin-add (Super Admin creating a new tenant + its owner auth user)
 *  - dev seeding
 *
 * Every other write goes through the caller's own RLS-scoped client
 * (see server.ts) so RLS is the thing actually enforcing tenant isolation.
 */
export function createSupabaseAdminClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
