"use client";

import * as React from "react";
import { boutiques } from "@/lib/data/store";
import { admins } from "@/lib/data/store";
import type { AdminUser, Boutique } from "@/lib/supabase/types";

/**
 * Mock session — stands in for a real Supabase Auth session in Phase 2. Not
 * persisted across a hard reload (sessionStorage would be a reasonable
 * Phase 3-adjacent touch, but a real session comes from Supabase then, so it
 * isn't worth building here). See docs/phase2-report.md "Mock data layer".
 */
export type Session =
  | { kind: "owner"; boutique: Boutique }
  | { kind: "admin"; admin: AdminUser }
  | null;

export interface DraftSignup {
  email: string;
  userId: string;
  termsAccepted: boolean;
}

interface SessionContextValue {
  session: Session;
  loginOwner: (email: string, password: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  loginAdmin: (email: string, password: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  signOut: () => void;
  /** Dev convenience used by fixtures/tests to switch tenants without a form. */
  setSessionDirect: (s: Session) => void;
  /** Carries an in-progress owner signup (post auth-signup, pre-registration/
   * terms) across the signup → register → terms screens. */
  draftSignup: DraftSignup | null;
  startDraftSignup: (email: string) => void;
  setDraftTermsAccepted: (accepted: boolean) => void;
  clearDraftSignup: () => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

// Any password is accepted for these fixture emails — this is presentation
// fixture data, not a real credential (see §7 of the Phase 2 brief).
const FIXTURE_PASSWORD = "boutiqo-mock";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session>(null);
  const [draftSignup, setDraftSignup] = React.useState<DraftSignup | null>(null);

  const startDraftSignup = React.useCallback((email: string) => {
    setDraftSignup({ email, userId: `u_draft_${Math.random().toString(36).slice(2, 8)}`, termsAccepted: false });
  }, []);
  const setDraftTermsAccepted = React.useCallback((accepted: boolean) => {
    setDraftSignup((d) => (d ? { ...d, termsAccepted: accepted } : d));
  }, []);
  const clearDraftSignup = React.useCallback(() => setDraftSignup(null), []);

  const loginOwner = React.useCallback(async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 300));
    if (password !== FIXTURE_PASSWORD) {
      return { ok: false as const, code: "invalid_credentials", message: "Incorrect email or password" };
    }
    const boutique = boutiques.find((b) => b.email.toLowerCase() === email.toLowerCase());
    if (!boutique) {
      return { ok: false as const, code: "invalid_credentials", message: "Incorrect email or password" };
    }
    if (boutique.status === "disabled") {
      return { ok: false as const, code: "account_disabled", message: "This boutique account has been disabled. Contact Boutiqo support." };
    }
    setSession({ kind: "owner", boutique });
    return { ok: true as const };
  }, []);

  const loginAdmin = React.useCallback(async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 300));
    if (password !== FIXTURE_PASSWORD) {
      return { ok: false as const, code: "invalid_credentials", message: "Incorrect email or password" };
    }
    const admin = admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!admin) {
      return { ok: false as const, code: "invalid_credentials", message: "Incorrect email or password" };
    }
    if (!admin.active) {
      return { ok: false as const, code: "account_suspended", message: "This admin account has been suspended." };
    }
    setSession({ kind: "admin", admin });
    return { ok: true as const };
  }, []);

  const signOut = React.useCallback(() => setSession(null), []);

  return (
    <SessionContext.Provider
      value={{ session, loginOwner, loginAdmin, signOut, setSessionDirect: setSession, draftSignup, startDraftSignup, setDraftTermsAccepted, clearDraftSignup }}
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

export const FIXTURE_LOGIN_PASSWORD = FIXTURE_PASSWORD;
