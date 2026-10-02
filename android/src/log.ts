// Development-only logging. Release builds log nothing. Callers must pass
// URLs through redactUrl() and never pass tokens, passwords or user data.
export function devLog(event: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[boutiqo-shell] ${event}`, detail ?? "");
}
