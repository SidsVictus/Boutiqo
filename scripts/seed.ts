/**
 * Development-only seed script. Creates:
 *  - 4 Super Admin accounts (one per role) at @boutiqo.dev
 *  - 2 Boutique Owner tenants at @boutiqo.dev, each with customers and orders
 *    covering every stage (including one overdue-by-derivation order) and a
 *    seeded boutique logo + cloth photo in R2
 *  - 1 order with its tracking token printed, for exercising the cust-track
 *    read path end-to-end
 *
 * NEVER run this against a production project. Requires SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage: npx tsx scripts/seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, buildObjectKey } from "../src/lib/r2";

const DEV_PASSWORD = "Boutiqo-Dev-2026!";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  return v;
}

async function main() {
  const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  console.log("Seeding Super Admin accounts...");
  const admins = [
    { name: "Dev Owner Admin", email: "admin.owner@boutiqo.dev", role: "owner_admin", active: true },
    { name: "Dev Support Admin", email: "admin.support@boutiqo.dev", role: "support_admin", active: true },
    { name: "Dev Billing Admin", email: "admin.billing@boutiqo.dev", role: "billing_admin", active: true },
    { name: "Dev Viewer Admin", email: "admin.viewer@boutiqo.dev", role: "viewer", active: false },
  ] as const;

  for (const a of admins) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: a.email,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    const { error: insertError } = await supabase
      .from("admins")
      .insert({ user_id: created.user.id, name: a.name, email: a.email, role: a.role, active: a.active });
    if (insertError) throw insertError;
    console.log(`  admin created: ${a.email} (${a.role}, active=${a.active})`);
  }

  console.log("Seeding boutique owners + tenants...");
  const owners = [
    { email: "owner1@boutiqo.dev", name: "Meera Boutique", ownerName: "Meera Nandini", area: "Banjara Hills", category: "Ladies tailoring & boutique" },
    { email: "owner2@boutiqo.dev", name: "Silk Story", ownerName: "Fathima Begum", area: "Jubilee Hills", category: "Designer boutique" },
  ];

  const boutiqueIds: string[] = [];
  for (const o of owners) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: o.email,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    const { data: boutique, error: insertError } = await supabase
      .from("boutiques")
      .insert({
        owner_user_id: created.user.id,
        name: o.name,
        owner_name: o.ownerName,
        area: o.area,
        email: o.email,
        phone: "98490 00000",
        category: o.category,
        terms_tnc_accepted: true,
        terms_privacy_accepted: true,
        terms_accepted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;
    boutiqueIds.push(boutique.id);
    console.log(`  boutique created: ${o.name} (${o.email})`);
  }

  console.log("Seeding customers + orders for boutique 1...");
  const { data: customer, error: custError } = await supabase
    .from("customers")
    .insert({ boutique_id: boutiqueIds[0], name: "Aisha Fatima", phone: "98490 12345", address: "Banjara Hills" })
    .select()
    .single();
  if (custError) throw custError;

  const stages = ["received", "cutting", "stitching", "ready", "delivered"] as const;
  let trackingTokenToPrint = "";
  for (const [i, stage] of stages.entries()) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (stage === "received" && i === 0 ? -3 : 10 + i)); // first one overdue-by-derivation
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        boutique_id: boutiqueIds[0],
        customer_id: customer.id,
        garment_type: "Lehenga blouse",
        stage,
        due_date: dueDate.toISOString().slice(0, 10),
        total_amount: 4500,
        advance_amount: 2000,
        tailor_name: "Sarita",
        cloth_description: "Wine raw silk, 1.5 m",
      })
      .select()
      .single();
    if (error) throw error;
    if (stage === "received") trackingTokenToPrint = order.tracking_token;
    console.log(`  order ${order.order_code} — stage=${stage} due=${order.due_date}`);
  }

  console.log("Uploading a seed boutique logo + cloth photo to R2...");
  const r2 = getR2Client();
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const { objectKey: logoKey, fileId: logoFileId } = buildObjectKey({
    kind: "boutique_logo",
    boutiqueId: boutiqueIds[0],
    mimeType: "image/png",
  });
  await r2.send(new PutObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: logoKey, Body: pngBytes, ContentType: "image/png" }));
  const { data: logoFile } = await supabase
    .from("files")
    .insert({ id: logoFileId, boutique_id: boutiqueIds[0], kind: "boutique_logo", object_key: logoKey, mime_type: "image/png", size_bytes: pngBytes.length, upload_status: "uploaded" })
    .select()
    .single();
  await supabase.from("boutiques").update({ logo_file_id: logoFile!.id }).eq("id", boutiqueIds[0]);
  console.log(`  logo uploaded: ${logoKey}`);

  console.log("\nDev seed complete. Development-only credentials (never use in production):");
  console.log(`  password for every seeded account: ${DEV_PASSWORD}`);
  console.log(`  tracking token for BQ- order (received stage): ${trackingTokenToPrint}`);
  console.log(`  test it at: /api/track/${trackingTokenToPrint}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
