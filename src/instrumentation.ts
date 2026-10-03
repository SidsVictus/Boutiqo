/**
 * Runs once when a server instance starts (each Netlify function cold start).
 * Brings the super-admin roster in line with lib/auth/adminRoster.ts right
 * after a deploy, before anyone signs in.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { syncAdminRoster } = await import("@/lib/auth/adminRoster");
  void syncAdminRoster();
}
