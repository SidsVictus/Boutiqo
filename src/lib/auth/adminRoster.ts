import "server-only";

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logSecurityEvent } from "@/lib/log";

/**
 * The Boutiqo super-admin team, by email only. No passwords live in code,
 * config or the database seed: a listed address becomes an admin the first
 * time it signs in with Google and Google reports the address as verified.
 * (Afterwards the admin may also set a password via "Forgot password?",
 * which emails that same inbox.) A password signup that merely types a listed
 * email can never claim admin, even if Supabase "Confirm email" is off.
 *
 * Emails are not secrets, so listing them here is safe; the database rows and
 * the Google check are what grant access. Same rules as
 * supabase/migrations/0012_admin_allowlist_google_link.sql, which also does
 * this inside the database; both are idempotent.
 */
export const SUPER_ADMINS: ReadonlyArray<{ email: string; name: string }> = [
  { email: "sidsvictus@gmail.com", name: "Sids Victus" },
  { email: "help.boutiqo@gmail.com", name: "Boutiqo Help" },
];

/** Dev-seed admins (scripts/seed.ts) whose shared password was in the repo. */
export const PLACEHOLDER_ADMIN_EMAILS: ReadonlyArray<string> = [
  "admin.owner@boutiqo.dev",
  "admin.support@boutiqo.dev",
  "admin.billing@boutiqo.dev",
  "admin.viewer@boutiqo.dev",
];

function hasServiceRole(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** True when this auth user has a Google identity for `email` that Google marked verified. */
export function hasVerifiedGoogleIdentity(user: Pick<User, "identities">, email: string): boolean {
  const target = email.trim().toLowerCase();
  return (user.identities ?? []).some((i) => {
    const data = (i.identity_data ?? {}) as Record<string, unknown>;
    const verified = data.email_verified === true || data.email_verified === "true";
    return i.provider === "google" && verified && typeof data.email === "string" && data.email.trim().toLowerCase() === target;
  });
}

let rosterSync: Promise<void> | null = null;
let rosterSyncedAt = 0;
// Re-checked at most this often per server instance (tests set 0).
const SYNC_TTL_MS = Number(process.env.ADMIN_ROSTER_SYNC_TTL_MS ?? 10 * 60 * 1000);

/**
 * Removes the placeholder admins (rows and their auth users, unless that user
 * owns a boutique) and adds any missing SUPER_ADMINS as email-only
 * owner_admin rows. Runs at most once per SYNC_TTL_MS per server instance;
 * failures are logged and retried on the next call.
 */
export function syncAdminRoster(): Promise<void> {
  if (!hasServiceRole()) return Promise.resolve();
  if (rosterSync && Date.now() - rosterSyncedAt < SYNC_TTL_MS) return rosterSync;
  rosterSyncedAt = Date.now();
  rosterSync = doSync().catch((err) => {
    rosterSyncedAt = 0;
    logSecurityEvent("admin_roster_sync_failed", { reason: err instanceof Error ? err.message : String(err) });
  });
  return rosterSync;
}

async function doSync(): Promise<void> {
  const db = createSupabaseAdminClient();

  const { data: placeholders, error: phError } = await db.from("admins").select("id, user_id, email").in("email", [...PLACEHOLDER_ADMIN_EMAILS]);
  if (phError) throw phError;
  for (const row of placeholders ?? []) {
    const { error } = await db.from("admins").delete().eq("id", row.id);
    if (error) throw error;
    if (row.user_id) {
      const { data: owned } = await db.from("boutiques").select("id").eq("owner_user_id", row.user_id).maybeSingle();
      if (!owned) await db.auth.admin.deleteUser(row.user_id);
    }
    logSecurityEvent("placeholder_admin_removed", { email: row.email });
  }

  const { data: existing, error: exError } = await db.from("admins").select("email");
  if (exError) throw exError;
  const have = new Set((existing ?? []).map((r) => String(r.email).toLowerCase()));
  const missing = SUPER_ADMINS.filter((a) => !have.has(a.email));
  if (missing.length > 0) {
    const { error } = await db.from("admins").insert(missing.map((a) => ({ name: a.name, email: a.email, role: "owner_admin", active: true })));
    if (error) throw error;
    logSecurityEvent("super_admins_added", { count: missing.length });
  }
}

/**
 * After a sign-in, links an email-only admins row to this user, if the user
 * has a verified Google identity for that email. No-op for everyone else.
 */
export async function claimAdminRow(userId: string): Promise<void> {
  if (!hasServiceRole()) return;
  try {
    await syncAdminRoster();
    const db = createSupabaseAdminClient();
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return;
    const email = data.user.email.toLowerCase();
    if (!hasVerifiedGoogleIdentity(data.user, email)) return;

    const { data: alreadyAdmin } = await db.from("admins").select("id").eq("user_id", userId).maybeSingle();
    if (alreadyAdmin) return;
    const { data: pending } = await db.from("admins").select("id, email").is("user_id", null).ilike("email", email);
    const row = (pending ?? []).find((r) => String(r.email).toLowerCase() === email);
    if (!row) return;
    const { error: linkError } = await db.from("admins").update({ user_id: userId }).eq("id", row.id).is("user_id", null);
    if (!linkError) logSecurityEvent("admin_claimed_via_google", { userId });
  } catch (err) {
    logSecurityEvent("admin_claim_failed", { userId, reason: err instanceof Error ? err.message : String(err) });
  }
}
