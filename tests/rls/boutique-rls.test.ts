/**
 * Live RLS/auth/business-rule tests over real HTTP. See tests/rls/README.md for
 * prerequisites and why these are opt-in (RUN_LIVE_RLS_TESTS=1) rather than part of
 * the default `npm test` run.
 *
 * Every assertion here was independently verified against the live project via
 * SQL-level role simulation during Phase 1 development — see docs/phase1-report.md
 * for that transcript. This file reproduces the same checks the "normal" way (a
 * real signInWithPassword + real PostgREST requests) for anyone with network access.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const RUN = process.env.RUN_LIVE_RLS_TESTS === "1";
const DEV_PASSWORD = "Boutiqo-Dev-2026!";

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe.skipIf(!RUN)("Boutique tenant isolation (live)", () => {
  let owner1: SupabaseClient;
  let owner2: SupabaseClient;

  beforeAll(async () => {
    owner1 = await signIn("owner1@boutiqo.dev");
    owner2 = await signIn("owner2@boutiqo.dev");
  });

  it("owner1 sees exactly one boutique: their own", async () => {
    const { data, error } = await owner1.from("boutiques").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("owner1 cannot see owner2's customers", async () => {
    const { data: owner2Customers } = await owner2.from("customers").select("name");
    const { data: owner1View } = await owner1.from("customers").select("name");
    const owner2Names = new Set((owner2Customers ?? []).map((c) => c.name));
    for (const c of owner1View ?? []) expect(owner2Names.has(c.name)).toBe(false);
  });

  it("owner1 cannot insert a customer into owner2's boutique", async () => {
    const { data: b2 } = await owner2.from("boutiques").select("id").single();
    const { error } = await owner1.from("customers").insert({ boutique_id: b2!.id, name: "Impersonated" });
    expect(error).not.toBeNull();
  });

  it("anon has no direct table access", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data, error } = await anon.from("orders").select("id");
    expect(error === null ? data?.length : 0).toBe(0);
  });

  it("get_order_tracking returns a safe subset for a valid token and nothing for an invalid one", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: myOrder } = await owner1.from("orders").select("tracking_token").limit(1).single();
    const { data: valid } = await anon.rpc("get_order_tracking", { p_token: myOrder!.tracking_token });
    expect(valid).not.toBeNull();

    const { data: invalid } = await anon.rpc("get_order_tracking", { p_token: "f".repeat(64) });
    expect(invalid == null || (Array.isArray(invalid) && invalid.length === 0)).toBe(true);
  });
});

describe.skipIf(!RUN)("Boutique status business rules (live)", () => {
  it("on_hold blocks new orders but allows updating existing ones; disabled blocks everything", async () => {
    const owner1 = await signIn("owner1@boutiqo.dev");
    const admin = await signIn("admin.owner@boutiqo.dev");

    const { data: boutique } = await owner1.from("boutiques").select("id").single();

    await admin.from("boutiques").update({ status: "on_hold" }).eq("id", boutique!.id);
    const { data: cust } = await owner1.from("customers").select("id").limit(1).single();
    const { error: insertError } = await owner1
      .from("orders")
      .insert({ boutique_id: boutique!.id, customer_id: cust!.id, garment_type: "Test", due_date: "2027-01-01", total_amount: 100, advance_amount: 0 });
    expect(insertError).not.toBeNull();

    const { data: existingOrder } = await owner1.from("orders").select("id").limit(1).single();
    const { error: updateError } = await owner1.from("orders").update({ stage: "cutting" }).eq("id", existingOrder!.id);
    expect(updateError).toBeNull();

    await admin.from("boutiques").update({ status: "disabled" }).eq("id", boutique!.id);
    const { data: shouldBeEmpty } = await owner1.from("customers").select("id");
    expect(shouldBeEmpty).toHaveLength(0);

    await admin.from("boutiques").update({ status: "active" }).eq("id", boutique!.id);
  });

  it("an admin sub-role cannot exceed its documented scope", async () => {
    const support = await signIn("admin.support@boutiqo.dev");
    const owner1 = await signIn("owner1@boutiqo.dev");
    const { data: boutique } = await owner1.from("boutiques").select("id").single();

    const { data, error } = await support.from("boutiques").update({ status: "disabled" }).eq("id", boutique!.id).select();
    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
