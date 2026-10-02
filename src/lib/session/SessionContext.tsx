"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { createImplicitClient } from "@/lib/supabase/implicit";
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
  /** Display name from the identity provider (Google), used to prefill "Owner name". */
  name?: string;
  fields?: DraftRegistrationFields;
}

/** Injected by the Android shell (android/App.tsx) before the page loads. */
interface BoutiqoShellBridge {
  oauthRedirectUrl?: string;
}
declare global {
  interface Window {
    BoutiqoShell?: BoutiqoShellBridge;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

interface LoginResult {
  ok: boolean;
  code?: string;
  message?: string;
}

interface SessionContextValue {
  session: Session | undefined;
  login: (email: string, password: string) => Promise<LoginResult>;
  loginOwner: (email: string, password: string) => Promise<LoginResult>;
  loginAdmin: (email: string, password: string) => Promise<LoginResult>;
  signUpOwner: (email: string, password: string) => Promise<LoginResult>;
  signInWithGoogle: () => Promise<LoginResult>;
  requestPasswordReset: (email: string) => Promise<LoginResult>;
  updatePassword: (password: string) => Promise<LoginResult>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  draftSignup: DraftSignup | null;
  setDraftFields: (fields: DraftRegistrationFields) => void;
  clearDraftSignup: () => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/** A signed-in auth user who hasn't created their boutique yet. */
interface PendingUser {
  id: string;
  email: string;
  name?: string;
}

async function resolveSession(supabase: ReturnType<typeof createClient>): Promise<{ session: Session; pending: PendingUser | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { session: null, pending: null };

  // An admin's own row is visible via current_admin_self() even when
  // suspended (admins_select/is_admin() hide it once inactive — see
  // supabase/migrations/0009_admin_self_lookup.sql) — check admin first since
  // it's the narrower group.
  const { data: adminRows } = await supabase.rpc("current_admin_self");
  const admin = Array.isArray(adminRows) ? (adminRows[0] as AdminUser | undefined) : undefined;
  if (admin) {
    // Suspended: resolved as "suspended" at login time; a stale session just signs out.
    return { session: admin.active ? { kind: "admin", admin } : null, pending: null };
  }

  const { data: boutique } = await supabase.from("boutiques").select("*").eq("owner_user_id", user.id).maybeSingle();
  if (boutique) {
    return { session: boutique.status === "disabled" ? null : { kind: "owner", boutique: boutique as Boutique }, pending: null };
  }

  const meta = user.user_metadata ?? {};
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : undefined;
  return { session: null, pending: { id: user.id, email: user.email ?? "", name } };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [session, setSession] = React.useState<Session | undefined>(undefined);
  const [draftSignup, setDraftSignup] = React.useState<DraftSignup | null>(null);

  const refreshSession = React.useCallback(async () => {
    const { session: next, pending } = await resolveSession(supabase);
    setSession(next);
    // A signed-in user with no boutique is mid-registration. The draft lives
    // only in memory, so a full-page load (the Google OAuth redirect, an email
    // confirmation link, a reload) used to lose it and bounce the user from
    // /owner/register back to /owner/signup. Re-derive it from the real
    // auth user instead, keeping fields already entered for the same user.
    setDraftSignup((d) => {
      if (!pending) return null;
      if (d && d.userId === pending.id) return { ...d, name: d.name ?? pending.name };
      return { email: pending.email, userId: pending.id, name: pending.name };
    });
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
      // refreshSession() above re-seeds the registration draft for them.
      if (!body?.data?.boutique) return { ok: true, code: "registration_incomplete" };
      return { ok: true };
    },
    [refreshSession],
  );

  // One login pipeline for everyone. The platform console is never advertised
  // on the public entry point: admins sign in through the same form and are
  // told apart here, after authentication, by their own admin row.
  const login = React.useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await loginOwner(email, password);
      if (!res.ok) return res;

      const { data: adminRows } = await supabase.rpc("current_admin_self");
      const admin = Array.isArray(adminRows) ? (adminRows[0] as AdminUser | undefined) : undefined;
      if (!admin) return res; // a boutique owner (or registration-incomplete)

      if (!admin.active) {
        await supabase.auth.signOut();
        return { ok: false, code: "account_suspended", message: "This admin account has been suspended." };
      }
      setSession({ kind: "admin", admin });
      setDraftSignup(null);
      return { ok: true, code: "admin" };
    },
    [loginOwner, supabase],
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
      // Implicit-flow client so the confirmation email's link works in any
      // browser (see lib/supabase/implicit.ts); /auth/confirm completes it.
      const { data, error } = await createImplicitClient().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) return { ok: false, code: "already_registered", message: "An account with this email already exists. Log in instead." };
        if (/password/i.test(error.message)) return { ok: false, code: "weak_password", message: error.message };
        return { ok: false, code: "signup_failed", message: "Could not create the account. Please try again." };
      }
      if (!data.user) return { ok: false, code: "signup_failed", message: "Could not create the account. Please try again." };
      // With email confirmation on, Supabase returns a user with no identities
      // (instead of an error) for an address that's already registered, so
      // as not to reveal which emails exist.
      if (data.user.identities && data.user.identities.length === 0) {
        return { ok: false, code: "already_registered", message: "An account with this email already exists. Log in instead." };
      }
      // Email confirmation required: no session until the link in the email is
      // opened; that link lands on /auth/confirm, which continues to /owner/register.
      if (!data.session) return { ok: true, code: "confirm_email" };
      // Signed in straight away (no confirmation required): move the session
      // into the main, cookie-backed client.
      const { error: sessionError } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      if (sessionError) return { ok: false, code: "signup_failed", message: "Account created, but signing in failed. Please log in." };
      setDraftSignup({ email, userId: data.user.id });
      return { ok: true };
    },
    [supabase],
  );

  const signInWithGoogle = React.useCallback(async (): Promise<LoginResult> => {
    // Inside the Android app, Google refuses sign-in in an embedded WebView,
    // so hand the authorize URL to the shell, which opens it in a secure
    // browser tab and brings the result back to /auth/callback in this same
    // WebView (where the PKCE verifier cookie lives). See android/App.tsx.
    // The app is recognised by its native message bridge plus either the
    // injected BoutiqoShell object or its user-agent tag: the injected object
    // alone can arrive late, and missing the app sent sign-in to full Chrome.
    const shell = window.BoutiqoShell;
    const inApp = !!window.ReactNativeWebView && (!!shell?.oauthRedirectUrl || /BoutiqoAndroid\//.test(navigator.userAgent));
    if (inApp && window.ReactNativeWebView) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        // The shell replaces this with its own return URL either way.
        options: { redirectTo: shell?.oauthRedirectUrl ?? `${window.location.origin}/auth/callback`, skipBrowserRedirect: true },
      });
      if (error || !data.url) return { ok: false, code: "oauth_failed", message: "Google sign-in isn't available right now. Please try again." };
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "boutiqo:oauth", url: data.url }));
      return { ok: true };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return { ok: false, code: "oauth_failed", message: "Google sign-in isn't available right now. Please try again." };
    return { ok: true };
  }, [supabase]);

  const requestPasswordReset = React.useCallback(
    async (email: string): Promise<LoginResult> => {
      // Implicit-flow client so the emailed link works in whichever browser
      // opens it, not only this one (see lib/supabase/implicit.ts).
      const { error } = await createImplicitClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/owner/reset-password`,
      });
      // Don't reveal whether the address has an account; only surface errors
      // the user can act on.
      if (error && (error.status === 429 || /rate limit|security purposes/i.test(error.message))) {
        return { ok: false, code: "rate_limited", message: "Too many requests. Please wait a minute and try again." };
      }
      if (error && error.status !== 400 && error.status !== 404) {
        return { ok: false, code: "reset_failed", message: "Couldn't send the reset email. Please try again." };
      }
      return { ok: true };
    },
    [],
  );

  const updatePassword = React.useCallback(
    async (password: string): Promise<LoginResult> => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (/same|different from the old/i.test(error.message)) return { ok: false, code: "same_password", message: "Choose a password different from your current one." };
        if (/session|not authenticated|jwt/i.test(error.message)) return { ok: false, code: "no_session", message: "Your reset link has expired. Request a new one." };
        return { ok: false, code: "update_failed", message: error.message };
      }
      await refreshSession();
      return { ok: true };
    },
    [supabase, refreshSession],
  );

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setDraftSignup(null);
  }, [supabase]);

  const clearDraftSignup = React.useCallback(() => setDraftSignup(null), []);
  const setDraftFields = React.useCallback((fields: DraftRegistrationFields) => {
    setDraftSignup((d) => (d ? { ...d, fields } : d));
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, login, loginOwner, loginAdmin, signUpOwner, signInWithGoogle, requestPasswordReset, updatePassword, signOut, refreshSession, draftSignup, setDraftFields, clearDraftSignup }}
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
