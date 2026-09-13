# Boutiqo

Phone-first order book for small boutiques/tailors in Hyderabad. Multi-tenant
SaaS: a Super Admin console, self-service boutique owner accounts, and a
no-login WhatsApp tracking page for the boutique's own customers.

This repository implements **Phase 1** (the Supabase + Cloudflare R2 backend)
and **Phase 2** (the full frontend UI, built against local mock data — not yet
wired to the Phase 1 backend; that's Phase 3). See `docs/phase1-report.md` and
`docs/phase2-report.md` for the full completion reports, and `docs/decisions.md`
for every design decision made on the design bundle's behalf.

**Phase 2 status:** all 25 screens exist as real, click-through routes with
the ported design system, both responsive layouts, and every state (loading/
empty/error/upload states) described in the Phase 2 brief — but every screen
reads and writes an in-memory mock data layer (`src/lib/data/`), not the real
Supabase/R2 backend. No screen makes a network call to `*.supabase.co`,
Cloudflare R2, or Google OAuth. See "Mock data layer" below and
`docs/phase2-report.md` for exactly what Phase 3 needs to replace.

## Stack

- Next.js (App Router) + TypeScript, used here only for API route handlers
  (`src/app/api/**`) that front Supabase — no product screens yet.
- Supabase: Postgres, Auth, Row Level Security. No Prisma, no GraphQL, no
  custom Express layer — the Supabase client (or these route handlers) talk to
  Postgres directly.
- Cloudflare R2 for all binary files (cloth photos, boutique logos) — never
  Supabase Storage.
- Zod for validation, enforced server-side at every API boundary.
- Vitest for unit tests, Playwright for browser E2E tests.
- Design system ported directly from the design handoff bundle: the actual
  `_ds/boutiqo-design-system-.../tokens/*.css` and `css/components.css` files
  are imported verbatim (`src/styles/`) — colors, spacing, radius, elevation,
  motion and the `.bq-*` component classes all come from those files, not a
  Tailwind remap. Tailwind itself was removed from the project for Phase 2
  (see `docs/phase2-report.md` "Design system porting" for why). React
  wrapper components matching each design-system component's `.d.ts` prop
  contract live in `src/components/ds/`; Boutiqo-specific, prototype-only
  components (calendar, stepper, measurement grid, etc.) live in
  `src/components/app/`.

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

## Phase 2 — frontend (mock-data mode)

### Running it

```bash
npm run dev      # http://localhost:3000 — the full app, reading/writing in-memory mock data
```

Nothing to configure — the mock data layer needs no environment variables and
makes no network calls. Open `/` and pick a role, or go straight to
`/owner/login` / `/admin/login` and use the "Fill demo credentials" button
(any password is accepted for fixture accounts — see
`src/lib/session/SessionContext.tsx`). State resets on every full page reload
since it's all in-memory (`src/lib/data/store.ts`).

### Routing structure

Three route groups under `src/app/`, each split into an `(auth)` subgroup (no
nav chrome — signup/login/terms/signout) and an `(app)` subgroup (wrapped in
`AppShell`, requires a mock session, redirects to login otherwise):

- `owner/(auth)/{signup,register,terms,login,signout}` and
  `owner/(app)/{dashboard,customers,customers/new,customers/[id],orders/new,orders/[id],orders/[id]/confirm,orders/[id]/stage,calendar,billing,settings}`
- `admin/(auth)/{login,signout}` and
  `admin/(app)/{dashboard,boutiques,boutiques/new,boutiques/[id],boutiques/[id]/access,roles}`
- `track/[token]` — standalone, no chrome, no auth group (the customer never logs in)

### Mock data layer — the seam Phase 3 replaces

`src/lib/data/` is the **only** thing any screen reads or writes through —
no component reaches into fixture arrays directly. One module per resource
(`boutiques.ts`, `customers.ts`, `orders.ts`, `admins.ts`, `tracking.ts`,
`uploads.ts`), each exporting functions shaped like the real Phase 1 API
(`createOrder(input): Promise<Order>`, `getOrderTracking(token): Promise<TrackingView | null>`,
etc.), backed by `store.ts`'s in-memory arrays (typed with Phase 1's actual
`Boutique`/`Customer`/`Order`/`AdminUser`/`FileRow` types from
`src/lib/supabase/types.ts`, so field names never drift from the real schema).
Every function routes through `simulate()`, which adds realistic latency and
can be forced to fail (`setForceFailure(true)`) — this is what actually
exercises the loading/error states in the UI during development and testing,
not just styled-in-isolation markup. Business rules Phase 1's RLS enforces
(on_hold/disabled blocking new orders, admin sub-role boutique-status limits,
per-boutique sequential order codes) are re-implemented here so the UI can be
built and tested against the same behavior before Phase 3 wires up the real
backend. **Phase 3's job is to replace the internals of these modules with
real `fetch`/Supabase-client calls — the function signatures and return
shapes are the contract and should not need to change.**

### Layouts and the responsive breakpoint

The design's mobile (390px, bottom tab bar) and web (≤1280px, 236px sidebar)
layouts are both real, always-mounted DOM trees (`.bq-shell-mobile` /
`.bq-shell-web` in `AppShell.tsx`), toggled by a single CSS breakpoint at
**1024px** (`src/app/app.css`'s `@media (min-width: 1024px)`) — not a manual
toggle, not JS viewport detection. 1024px was chosen because the web layout's
236px sidebar plus a comfortable content column needs meaningfully more room
than a phone frame, while the mobile bottom-tab-bar pattern stays perfectly
usable well past 390px, up through most tablet widths. Every difference in
the handoff's "what changes" table is implemented at this same breakpoint:
nav placement, the owner tab bar's `+` vs. the web "New order" button, page
title sizing, `bq-g2`/`bq-g3` grid collapsing, the measurement grid's 2-vs-3
columns, the measurement unit suffix's visibility, auth card width, and cloth
photo height. Auth screens and the tracking page never render either shell.

### Svetze font licensing — pre-launch blocker

The Svetze display font (used for the wordmark, screen titles, hero numbers
and empty states) is bundled under a **personal-use license** (per the design
handoff). It is wired up and used throughout this Phase 2 build for accurate
visual development, but **a commercial license must be purchased before this
ships to production.** This is a real, outstanding blocker — not a Phase 2
detail to lose track of.

### Brand logo

The sidebar/topbar/auth-screen wordmark uses a user-supplied raster lockup
(`public/brand/logo.png`, via `src/components/app/Logo.tsx`) per explicit
direction partway through this phase. Note this **overrides** the design
handoff's own instruction not to use its bundled raster lockup
(`_ds/.../assets/logo-lockup.jpeg`) and instead set the wordmark live in
Svetze + a signal-red dot — that guidance still applies to the *handoff's*
lockup specifically; the image actually used here is a different, user-
provided asset. See `docs/phase2-report.md` for this judgment call.

### Testing

```bash
npm test              # vitest — calc/business-logic + mock data layer + R2 (unit)
npm run test:e2e       # playwright — full browser flows against `next build && next start`
```

Both suites run entirely offline against the mock data layer / a local S3
mock — no live Supabase or R2 needed for Phase 2's own tests. See
`docs/phase2-report.md` for exactly what was run and the results.

## Known limitations from Phase 1 (read before Phase 3)

See `docs/phase1-report.md` → "Known limitations" for the full list — in
short: this was built in a network-restricted sandbox, so live HTTP-level
Auth/R2 testing wasn't possible there. RLS and business rules were instead
verified directly against the live database (documented, with output, in that
report) and R2's upload/download logic was verified against a local
S3-compatible mock. Both are standard, legitimate testing techniques, but a
normal development machine should still run `npm run test:rls` once seeded to
reproduce the same checks over real HTTP before shipping.
