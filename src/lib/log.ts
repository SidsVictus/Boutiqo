import "server-only";

/**
 * Minimal structured server-side logging — Phase 4 found that failed logins,
 * rejected cross-tenant/authorization attempts, and upload failures were
 * surfaced to the client but recorded nowhere an operator could see them.
 *
 * This is deliberately not a logging library or an observability stack: a
 * single-line JSON `console.error` is enough for V1 — most deployment
 * targets (Vercel, any container platform) capture stdout/stderr into their
 * own log aggregation without any further wiring. Swap the implementation
 * here if a real log sink is added later; call sites don't need to change.
 */
export type SecurityEventKind =
  | "login_failed"
  | "account_disabled_login_blocked"
  | "admin_suspended_login_blocked"
  | "authorization_rejected"
  | "upload_failed";

export function logSecurityEvent(kind: SecurityEventKind, details: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      event: kind,
      ...details,
    }),
  );
}
