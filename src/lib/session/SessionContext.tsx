"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdminUser, Boutique } from "@/lib/supabase/types";

/**
 * Phase 3: real Supabase Auth session, replacing Phase 2's in-memory mock.
 * `session` is `undefined` while the initial session check is in flight (so
 * route guards can show a loading state instead of flashing a redirect),
 * `null` when signed out, and one of the two real, RLS-backed shapes below
 * once resolved.
 */
export type Session = { kind: "owner"; boutique: Boutique } | { kind: "admin"; admin: AdminUser } | null;

export interface DraftRegistrationFields {
  name: string;
  area?: string;
  ownerName: string;
  phone?: string;
  gstNumber?: string;
  category: string;
}

export interface DraftSignup {
  email: string;
  userId: string;
  fields?: DraftRegistrationFields;
}

interface LoginResult {
  ok: boolean;
  code?: string;
  message?: string;
}

interface SessionContextValue {
  session: Session | undefined;
  loginOwner: (email: string, password: string) => Promise<LoginResult>;
  loginAdmin: (email: string, password: string) => Promise<LoginResult>;
  signUpOwner: (email: string, password: string) => Promise<LoginResult>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  draftSignup: DraftSignup | null;
  setDraftFields: (fields: DraftRegistrationFields) => void;
  clearDraftSignup: () => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

async function resolveSession(supabase: ReturnType<typeof createClient>): Promise<Session> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // An admin's own row is visible via current_admin_self() even when
  // suspended (admins_select/is_admin() hide it once inactive — see
  // supabase/migrations/0009_admin_self_lookup.sql) — check admin first since
  // it's the narrower group.
  const { data: adminRows } = await supabase.rpc("current_admin_self");
  const admin = Array.isArray(adminRows) ? (adminRows[0] as AdminUser | undefined) : undefined;
  if (admin) {
    if (!admin.active) return null; // resolved elsewhere as "suspended" at login time; a stale session just signs out.
    return { kind: "admin", admin };
  }

  const { data: boutique } = await supabase.from("boutiques").select("*").eq("owner_user_id", user.id).maybeSingle();
  if (boutique) {
    if (boutique.status === "disabled") return null;
    return { kind: "owner", boutique: boutique as Boutique };
  }

  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [session, setSession] = React.useState<Session | undefined>(undefined);
  const [draftSignup, setDraftSignup] = React.useState<DraftSignup | null>(null);

  const refreshSession = React.useCallback(async () => {
    setSession(await resolveSession(supabase));
  }, [supabase]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the initial session check on mount is genuinely async, not a synchronous setState.
    void refreshSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refreshSession();
    });
    return () => subscription.unsubscribe();
  }, [supabase, refreshSession]);

  const loginOwner = React.useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, code: body?.error?.code ?? "invalid_credentials", message: body?.error?.message ?? "Incorrect email or password" };
      }
      // The route set real session cookies; the browser client picks them up
      // via onAuthStateChange, but we also refresh eagerly so the caller can
      // navigate immediately without waiting on that event.
      await refreshSession();
      // A signed-in user with no boutique row means they created their
      // auth.users account (owner/signup) but never finished owner/register
      // + owner/terms — e.g. they closed the tab, and the in-memory
      // draftSignup from that session is gone. Without this, they'd log in
      // "successfully" only to be bounced back out of /owner/* by the
      // no-session guard, forever, with no path back to /owner/register.
      // Re-seed draftSignup (fields empty — register just re-collects them)
      // so the caller can route them to finish registration instead.
      // apiOk() wraps the route's payload as { data: { user, boutique } } —
      // reading body.boutique directly (instead of body.data.boutique) was a
      // real bug: it's always undefined regardless of the real value, so
      // every successful login was wrongly treated as registration-incomplete.
      if (!body?.data?.boutique) {
        setDraftSignup({ email: body?.data?.user?.email ?? email, userId: body?.data?.user?.id ?? "" });
        return { ok: true, code: "registration_incomplete" };
      }
      return { ok: true };
    },
    [refreshSession],
  );

  const loginAdmin = React.useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, code: "invalid_credentials", message: "Incorrect email or password" };

      const { data: adminRows } = await supabase.rpc("current_admin_self");
      const admin = Array.isArray(adminRows) ? (adminRows[0] as AdminUser | undefined) : undefined;

      if (!admin) {
        await supabase.auth.signOut();
        return { ok: false, code: "invalid_credentials", message: "Incorrect email or password" };
      }
      if (!admin.active) {
        await supabase.auth.signOut();
        return { ok: false, code: "account_suspended", message: "This admin account has been suspended." };
      }
      setSession({ kind: "admin", admin });
      return { ok: true };
    },
    [supabase],
  );

  const signUpOwner = React.useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { ok: false, code: "signup_failed", message: error.message };
      if (!data.user) return { ok: false, code: "signup_failed", message: "Could not create the account" };
      // If email confirmation is required by the project's Auth settings,
      // data.session will be null here even though the user row exists —
      // /api/auth/register requires an authenticated session, so registration
      // can't proceed until the address is confirmed. Not exercised over live
      // network in this session; see docs/phase3-report.md.
      setDraftSignup({ email, userId: data.user.id });
      return { ok: true };
    },
    [supabase],
  );

  const signInWithGoogle = React.useCallback(async () => {
    // Phase 3 scope: wire the real redirect call correctly. Whether it
    // actually completes depends on a Google OAuth provider being configured
    // in the Supabase Auth dashboard — a one-time human step this session
    // cannot perform (see docs/phase3-report.md §3.3).
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/owner/register` },
    });
  }, [supabase]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, [supabase]);

  const clearDraftSignup = React.useCallback(() => setDraftSignup(null), []);
  const setDraftFields = React.useCallback((fields: DraftRegistrationFields) => {
    setDraftSignup((d) => (d ? { ...d, fields } : d));
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, loginOwner, loginAdmin, signUpOwner, signInWithGoogle, signOut, refreshSession, draftSignup, setDraftFields, clearDraftSignup }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
