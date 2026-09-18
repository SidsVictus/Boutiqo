# Boutiqo

Phone-first order book for small boutiques/tailors in Hyderabad. Multi-tenant
SaaS: a Super Admin console, self-service boutique owner accounts, and a
no-login WhatsApp tracking page for the boutique's own customers.

This repository implements **Phase 1** (the Supabase + Cloudflare R2 backend),
**Phase 2** (the full frontend UI), **Phase 3** (wiring that UI to the real
backend), and **Phase 4** (a full QA/security/production-readiness audit —
the final phase). See `docs/phase1-report.md` through `docs/phase4-report.md`
for the full completion reports, and `docs/decisions.md` for every design
decision made on the design bundle's behalf.

**Current status:** all 25 screens are wired to the real Supabase project —
real Auth (signup/login/logout/session persistence), real RLS-scoped reads
and writes, real file uploads to Cloudflare R2 (once enabled — see "Known
limitations" below), and the real no-login tracking RPC. The in-memory mock
data layer Phase 2 built has been retired; `src/lib/data/*.ts` now call the
real Supabase client / Phase 1's API routes directly. Phase 4 re-ran the
full RLS/business-rule audit live against the database (26 checks, all
passing) and found and fixed two real frontend bugs (a stuck-login loop for
an abandoned signup, and a silently-lost cloth-photo-upload-failure toast) —
see `docs/phase4-report.md` §2. **Live end-to-end verification (real HTTP
against the real Supabase project, real R2 uploads) has still not been
executed in any phase** — the sandbox all four phases were built in cannot
reach `*.supabase.co` or R2's data plane. See `docs/phase4-report.md` §14 for
the exact, prioritized list of commands a normal development machine needs
to run to close that gap before this ships.

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
5. **Email confirmation**: if your project's Auth settings require confirming
   a new address before it has a usable session, `supabase.auth.signUp()`
   won't return a session immediately — and `POST /api/auth/register`
   requires an authenticated session to run. Either disable "Confirm email"
   for local development, or add an email-confirmation step to the
   owner-signup flow before registration can proceed (not built — this
   session couldn't reach the Auth API to determine which the project
   actually needs; see `docs/phase3-report.md`).
6. **Google OAuth provider**: to make the "Continue with Google" button on
   `/owner/signup` actually complete a sign-in (the button already calls
   `supabase.auth.signInWithOAuth({ provider: "google", ... })` correctly),
   configure a Google provider under Authentication → Providers in the
   Supabase dashboard, with a real OAuth client ID/secret from a Google Cloud
   project, and add this app's origin(s) to the provider's authorized
   redirect URIs. Not configured as of this repository's last update — the
   button will show Supabase's own "provider not enabled" error until it is.

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
npm run dev      # http://localhost:3000 — the real app, real Supabase project required
npm run build    # production build (also type-checks)
npm run lint
```

Requires `.env.local` filled in per "Local setup" above — every screen now
reads/writes the real Supabase project (and R2, once enabled). There is no
mock-data mode anymore.

## Testing

```bash
npm test                          # unit tests (calc/business-logic) + R2 flow against a local S3-compatible mock
npm run test:rls                  # live RLS/auth/business-rule tests over real HTTP (Phase 1)
RUN_LIVE_E2E=1 npm run test:e2e   # full browser E2E against the real integrated app
```

`npm test` runs entirely offline: R2 is exercised against `s3rver` (a local
S3-compatible mock — real R2 speaks the same protocol), and the remaining
unit tests (pure calc/formatting functions) need no network. `npm run
test:rls` and `RUN_LIVE_E2E=1 npm run test:e2e` both need real network access
to your Supabase project, seeded dev accounts (`npm run seed`), and — for
`tests/e2e/file-upload.spec.ts` specifically — a real, enabled R2 bucket.
Set `TEST_OWNER_EMAIL`/`TEST_OWNER_PASSWORD`, `TEST_ADMIN_EMAIL`/
`TEST_ADMIN_PASSWORD`, and (for the tracking-page spec) `TEST_TRACKING_TOKEN`
per `.env.example`.

See `docs/phase1-report.md` and `docs/phase3-report.md` for what was actually
run and observed in the environment this was built in (which has restricted
outbound network access to `*.supabase.co` and to R2's data-plane endpoint),
versus what a normal development machine can additionally run.

## Architecture summary

- **Auth:** Supabase Auth, wired for real in `src/lib/session/SessionContext.tsx`.
  Boutique owners: `supabase.auth.signUp()` for signup, `POST /api/auth/login`
  for login (this route also signs a disabled boutique's owner back out
  immediately), Google OAuth via `supabase.auth.signInWithOAuth()` (provider
  configuration still pending — see "Local setup" above). Super Admins: seeded
  only, `supabase.auth.signInWithPassword()` directly, gated by the `admins`
  table via the `current_admin_self()` RPC (see
  `supabase/migrations/0009_admin_self_lookup.sql`). Customers never
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

## Frontend architecture (Phase 2 UI, Phase 3 integration)

### Routing structure

Three route groups under `src/app/`, each split into an `(auth)` subgroup (no
nav chrome — signup/login/terms/signout) and an `(app)` subgroup (wrapped in
`AppShell`, requires a mock session, redirects to login otherwise):

- `owner/(auth)/{signup,register,terms,login,signout}` and
  `owner/(app)/{dashboard,customers,customers/new,customers/[id],orders/new,orders/[id],orders/[id]/confirm,orders/[id]/stage,calendar,billing,settings}`
- `admin/(auth)/{login,signout}` and
  `admin/(app)/{dashboard,boutiques,boutiques/new,boutiques/[id],boutiques/[id]/access,roles}`
- `track/[token]` — standalone, no chrome, no auth group (the customer never logs in)

### Data layer

`src/lib/data/` is still the **only** thing any screen reads or writes
through. One module per resource (`boutiques.ts`, `customers.ts`,
`orders.ts`, `admins.ts`, `tracking.ts`, `uploads.ts`) — as of Phase 3, each
calls the real Supabase client (`src/lib/data/supabaseClient.ts`'s `db()`,
RLS-scoped to the signed-in user) directly for reads, and either that same
client or a `fetch` to one of Phase 1's API routes (`apiFetch()`) for writes
that need privileged/server-side logic. Phase 2's in-memory mock arrays
(`store.ts`'s fixture data) have been removed; `store.ts` now holds only
generic helpers (`uid`, `ApiError`, the R2-mock forced-failure switch used by
`tests/r2/r2.test.ts`). See `docs/phase3-report.md` "Mock data layer
retirement" for the full before/after and the handful of documented
signature changes (e.g. `customerOrders` is now async).

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

Reverted to the design handoff's specified treatment: the wordmark
("boutiqo") is set live in Svetze by each call site's CSS, with
`src/components/app/Logo.tsx` rendering only the small signal-red accent dot
— no raster lockup image anywhere in the app. A Phase 2 revision briefly
rendered a user-supplied raster image instead (added mid-session at an
explicit request); Phase 3 reverted it since no such override is recorded in
this project's actual source-of-truth documents. See
`docs/phase3-report.md` §0 for the full account.

## Known limitations (read before Phase 4)

Both Phase 1 and Phase 3 were built in the same network-restricted sandbox:
outbound HTTPS to `*.supabase.co` and to R2's data-plane endpoint is blocked
by organizational egress policy, and R2 itself was never enabled on the
linked Cloudflare account. This means:

- Real HTTP-level Auth flows (signup, login, disabled/suspended rejection),
  `POST /api/auth/register`, and `POST /api/admin/boutiques` are implemented
  and were reasoned through carefully, but **could not be exercised over live
  HTTP in this session** — same as Phase 1 before it.
- Real file upload/download against live R2 **could not be attempted at
  all** — R2 is still not enabled on the linked Cloudflare account (confirmed
  again in Phase 3 via the same `r2_buckets_list` check Phase 1 used).
- Whatever database-level verification *was* possible (RLS/trigger behavior,
  a new migration's correctness) was done directly against the live Supabase
  project via SQL-role simulation — the same legitimate technique Phase 1
  used, documented with real output in `docs/phase1-report.md` and
  `docs/phase3-report.md`.

See `docs/phase4-report.md` for the complete, itemized list of what is and
isn't verified as of the final phase, the two product decisions that need
founder sign-off before launch ("Confirm email" setting, Google OAuth
provider), and §14's exact, prioritized list of what a normal development
machine (with real network access) needs to run before this ships —
`RUN_LIVE_RLS_TESTS=1 npm run test:rls` and `RUN_LIVE_E2E=1 npx playwright test`
reproduce the same checks over real HTTP once that access exists.
