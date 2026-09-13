/**
 * Phase 3: this module now holds only generic, backend-agnostic helpers used
 * by the real data-layer modules and R2 upload flow — the Phase 2 in-memory
 * fixture arrays (boutiques/customers/orders/admins/files) have been removed
 * now that every module reads/writes the real Supabase project instead. See
 * docs/phase3-report.md "Mock data layer retirement".
 */

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Thrown by every data-layer module on a failed request — carries the same
 * `code`/`message` shape the real API routes return (see `src/lib/api-response.ts`)
 * so UI error handling doesn't need to know whether it's talking to Supabase
 * directly or to a Next.js API route. */
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Kept for tests/r2 (Phase 1) and any code exercising the forced-failure path
// against R2's local mock — unrelated to the real Supabase/R2 integration.
let forcedFailure = false;
export function setForceFailure(on: boolean) {
  forcedFailure = on;
}
export function isForcingFailure() {
  return forcedFailure;
}
