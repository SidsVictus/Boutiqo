"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionContext";
import { AUTH_ERROR_MESSAGES } from "./redirects";

/**
 * For signed-out entry pages (home, login, signup): once the session check
 * resolves, send people who are already signed in where they belong instead
 * of showing them a login form again. Also returns the message for an
 * `?error=` code set by /auth/callback or a guard.
 */
export function useAuthPage(): { urlError: string | null } {
  const router = useRouter();
  const { session, draftSignup } = useSession();
  const [urlError, setUrlError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount (no useSearchParams, so the page stays statically renderable).
    if (code) setUrlError(AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.link);
  }, []);

  React.useEffect(() => {
    if (session === undefined) return;
    if (session?.kind === "owner") router.replace("/owner/dashboard");
    else if (session?.kind === "admin") router.replace("/admin/dashboard");
    else if (draftSignup && !draftSignup.fields) router.replace("/owner/register");
  }, [session, draftSignup, router]);

  return { urlError };
}
