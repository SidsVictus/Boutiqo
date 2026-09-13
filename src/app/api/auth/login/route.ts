import { createSupabaseRouteClient } from "@/lib/supabase/server";
import { z } from "zod";
import { apiError, apiOk, apiValidationError } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/log";

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// Wraps supabase.auth.signInWithPassword so a disabled boutique's owner can be
// signed back out immediately — server-side, not a UI decision. "on_hold" is
// allowed to log in (viewing existing orders is still permitted); only
// "disabled" blocks login entirely. See docs/decisions.md #3.
//
// Note: this covers every login that goes through this route. A true JWT-mint
// block (rejecting before a session token is even issued) requires wiring
// enforce_boutique_update_rules-style logic into a Supabase "Custom Access
// Token" Auth Hook from the project dashboard — see README's Known limitations.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const supabase = await createSupabaseRouteClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.session) {
    logSecurityEvent("login_failed", { email: parsed.data.email });
    return apiError(401, "invalid_credentials", "Incorrect email or password");
  }

  const { data: boutique } = await supabase
    .from("boutiques")
    .select("id, status")
    .eq("owner_user_id", data.user.id)
    .maybeSingle();

  if (boutique?.status === "disabled") {
    await supabase.auth.signOut();
    logSecurityEvent("account_disabled_login_blocked", { userId: data.user.id, boutiqueId: boutique.id });
    return apiError(403, "account_disabled", "This boutique account has been disabled. Contact Boutiqo support.");
  }

  return apiOk({ user: { id: data.user.id, email: data.user.email }, boutique: boutique ?? null });
}
