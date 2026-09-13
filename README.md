# Boutiqo

Phone-first order book for small boutiques/tailors in Hyderabad. Multi-tenant
SaaS: a Super Admin console, self-service boutique owner accounts, and a
no-login WhatsApp tracking page for the boutique's own customers.

**This repository currently implements Phase 1 only: the Supabase + Cloudflare
R2 backend.** There is no product UI yet (Phase 2). See
`docs/phase1-report.md` for the full completion report and
`docs/decisions.md` for the design decisions this phase made on the design
bundle's behalf.

## Stack

- Next.js (App Router) + TypeScript, used here only for API route handlers
  (`src/app/api/**`) that front Supabase — no product screens yet.
- Supabase: Postgres, Auth, Row Level Security. No Prisma, no GraphQL, no
  custom Express layer — the Supabase client (or these route handlers) talk to
  Postgres directly.
- Cloudflare R2 for all binary files (cloth photos, boutique logos) — never
  Supabase Storage.
- Zod for validation, enforced server-side at every API boundary.
- Vitest for unit tests and Playwright config for future E2E.

## Prerequisites

- Node.js 20+
- A Supabase project (Postgres 15+)
- A Cloudflare account with R2 enabled, and a bucket

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in real values, see below
```

### Supabase

1. Create a project at supabase.com (or use the Supabase CLI for local dev).
2. Apply the migrations in `supabase/migrations/` in order, against your
   project. If you have the Supabase CLI linked to your project:
   ```bash
   supabase db push
   ```
   Otherwise apply each `.sql` file in `supabase/migrations/` (numeric order)
   through the SQL editor, or via the Supabase MCP `apply_migration` tool.
3. Copy your project's URL, anon/publishable key, and **service role key**
   (Project Settings → API) into `.env.local`. The service role key is
   server-only — never prefix it with `NEXT_PUBLIC_`.
4. Optional but recommended: in Auth settings, enable "leaked password
   protection" (flagged by Supabase's own advisor; off by default).

### Cloudflare R2

1. Enable R2 in the Cloudflare dashboard for your account (one-time,
   requires accepting R2's terms — this can't be done via API).
2. Create a bucket (e.g. `boutiqo-uploads`).
3. Create an R2 API token (Account → R2 → Manage API Tokens) scoped to that
   bucket, and put its Account ID / Access Key ID / Secret Access Key /
   bucket name into `.env.local`.
4. Configure the bucket's CORS policy to allow only your app's actual
   origins (dev + prod), for both `PUT` (upload) and `GET` (download):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://your-prod-domain"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```
   Never use `"AllowedOrigins": ["*"]`.

### Seed development data

```bash
npm run seed
```

Creates 4 Super Admin accounts (one per role), 2 boutique tenants with
customers/orders across every stage, and prints a tracking token you can hit
via `/api/track/<token>`. **Development-only credentials — never reuse
these in production.** See `docs/phase1-report.md` for the exact accounts
this seeds and the password.

## Running

```bash
npm run dev      # http://localhost:3000 — minimal Phase 1 scaffolding only
npm run build    # production build (also type-checks)
npm run lint
```

## Testing

```bash
npm test              # unit tests + R2 flow against a local S3-compatible mock
npm run test:rls       # live RLS/auth/business-rule tests over real HTTP
                        # (needs network access to Supabase + npm run seed already run)
npm run test:e2e       # Playwright config (present, no specs written yet — Phase 2+)
```

`npm test` runs entirely offline: R2 is exercised against `s3rver` (a local
S3-compatible mock — real R2 speaks the same protocol), and validation/unit
tests need no network. `npm run test:rls` needs real network access to your
Supabase project and the seeded dev accounts.

See `docs/phase1-report.md` for what was actually run and observed in the
environment this was built in (which has restricted outbound network access),
versus what a normal development machine can additionally run.

## Architecture summary

- **Auth:** Supabase Auth. Boutique owners: email/password (+ Google OAuth,
  not yet wired up client-side since there's no login UI in Phase 1) via
  `/api/auth/login` and `/api/auth/register`. Super Admins: seeded only, login
  through the same Supabase Auth, gated by the `admins` table. Customers never
  authenticate at all.
- **Tenant isolation:** Row Level Security on every tenant-scoped table
  (`boutiques`, `customers`, `orders`, `files`), keyed off `boutique_id`
  directly (not a multi-hop join), backed by `current_boutique_id()` /
  `current_boutique_status()` / `is_admin()` / `current_admin_role()` helper
  functions. See `docs/decisions.md` for the exact status-effect matrix and
  admin sub-role permission matrix.
- **File uploads:** presigned-URL flow —
  `POST /api/uploads/presign` (authorize + create a `files` row + return a
  short-lived R2 PUT URL) → browser uploads directly to R2 →
  `POST /api/uploads/confirm` (mark uploaded, attach to the boutique/order) →
  `GET /api/files/:id/download-url` for owner-facing viewing. Object keys are
  tenant-scoped: `boutiques/{boutiqueId}/logo/{fileId}.{ext}` and
  `boutiques/{boutiqueId}/orders/{orderId}/cloth/{fileId}.{ext}`.
- **Customer tracking:** `GET /api/track/:token` — no Supabase session
  involved. Calls the `get_order_tracking(token)` Postgres function
  (`SECURITY DEFINER`, returns only the exact safe columns cust-track needs),
  then — only here, server-side — turns the returned R2 object key into a
  presigned GET URL. A wrong token gets a generic 404, indistinguishable from
  any other miss.

## Known limitations (read before Phase 2)

See `docs/phase1-report.md` → "Known limitations" for the full list — in
short: this was built in a network-restricted sandbox, so live HTTP-level
Auth/R2 testing wasn't possible there. RLS and business rules were instead
verified directly against the live database (documented, with output, in that
report) and R2's upload/download logic was verified against a local
S3-compatible mock. Both are standard, legitimate testing techniques, but a
normal development machine should still run `npm run test:rls` once seeded to
reproduce the same checks over real HTTP before shipping.
