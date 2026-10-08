# Boutiqo

Phone-first order book for small boutiques and tailors. A multi-tenant SaaS
with three audiences:

- **Boutique owners** — customers and measurements, orders across stages, a
  colour-coded calendar, billing.
- **Super admins** — a console for onboarding boutiques and managing who can
  do what.
- **Their customers** — a no-login tracking page (`/track/<token>`) shared
  over WhatsApp, showing where an order is.

The repo also ships a standalone marketing page (`/landing`) and a thin
Android shell (`android/`) that wraps the web app in a WebView.

**Production:** https://boutiqoo.netlify.app · **Repository:** https://github.com/SidsVictus/Boutiqo

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** — UI and API routes.
- **Supabase** — Postgres, Auth, Row Level Security. No Prisma, no GraphQL,
  no custom Express layer: the Supabase client (or the route handlers) talks
  to Postgres directly.
- **Cloudflare R2** — every binary file (cloth photos, boutique logos) via
  presigned URLs. Never Supabase Storage.
- **Zod** — validation enforced server-side at every API boundary.
- **Design system** — the design handoff's CSS imported verbatim
  (`src/styles/`, `.bq-*` classes, tokens). Tailwind was removed; React
  wrappers for the handoff components live in `src/components/ds/`,
  product-specific pieces in `src/components/app/`.
- **Vitest** (unit/integration), **Playwright** (browser E2E).

## Quick start

Prerequisites: Node.js 20+, a Supabase project (Postgres 15+), and — only if
you want file uploads to work — a Cloudflare account with an R2 bucket.

```bash
npm install
cp .env.example .env.local   # fill in real values, see below
```

### Environment (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project, browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only — never prefixed `NEXT_PUBLIC_`, never sent to the browser |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | server-only R2 credentials |
| `R2_ENDPOINT` | optional override for an S3-compatible mock (tests set their own) |
| `NEXT_PUBLIC_APP_URL` | documentation only — the app builds links from `window.location.origin` |

### Database

Apply the 13 migrations in `supabase/migrations/` in order. With the Supabase
CLI linked to your project:

```bash
supabase db push
```

or paste each file through the SQL editor in numeric order.

Auth settings that need a decision on a fresh project:

- **Email confirmation** — `POST /api/auth/register` requires a session, so
  either disable "Confirm email" for development or add a confirmation step
  to signup (not built; see `docs/phase3-report.md`).
- **Google OAuth** — the "Continue with Google" buttons already call
  `signInWithOAuth`; the provider must be configured in the Supabase
  dashboard before they work.

### Seed development data (optional)

```bash
SEED_DEV_ADMINS=1 npm run seed
```

Two boutique tenants with customers and orders across every stage (plus a
seeded logo and cloth photo, so R2 must be configured) and a printed
tracking token for exercising the customer-facing read path. With
`SEED_DEV_ADMINS=1` it also creates the four dev Super Admin accounts (one
per role, `@boutiqo.dev`). Development-only credentials — see
`docs/phase1-report.md`. Never run it against a production project.

### Run

```bash
npm run dev     # http://localhost:3000
npm run build   # production build, includes type-checking
npm run lint
```

## Testing

| Command | Covers | Network |
| --- | --- | --- |
| `npm test` | unit tests (calc, validation, data layer, auth redirects, …) + the full R2 upload/download flow against `s3rver` | none |
| `npm run test:e2e:auth` | every sign-in flow in a real browser against an in-memory Supabase/Auth stand-in | none |
| `npm run test:rls` | live RLS/auth/business-rule checks over real HTTP | Supabase + seeded accounts |
| `RUN_LIVE_E2E=1 npm run test:e2e` | full browser suite against the running app | Supabase (plus R2 for the file-upload spec) |

`npm test` runs entirely offline. R2 is exercised against `s3rver`, a local
S3-compatible mock that speaks the same protocol as real R2
(`tests/r2/r2.test.ts` is self-contained — it configures its own endpoint and
credentials). The live suites read `TEST_*` values from `.env.example`.

## Architecture

### Routes

Route groups under `src/app/`, each split into an `(auth)` subgroup (no nav
chrome) and an `(app)` subgroup (wrapped in `AppShell`, session required):

- **Root `/`** — the entry card for a new boutique owner; returning owners
  and admins sign in at `/owner/login` / `/admin/login`.
- **`owner/`** — `dashboard`, `customers` (+ `new`, `[id]`), `orders/new`,
  `orders/[id]` (+ `confirm`, `stage`), `calendar`, `billing`, `settings`;
  auth: `signup`, `register`, `login`, `forgot-password`, `reset-password`,
  `signout`, `terms`.
- **`admin/`** — `dashboard`, `boutiques` (+ `new`, `[id]`, `[id]/access`),
  `roles`; auth: `login`, `signout`.
- **`track/[token]`** — standalone, no chrome, no auth (the customer never
  logs in).
- **`landing/`** — the standalone marketing page (see below).
- **`api/**`** — route handlers fronting Supabase (auth, orders, customers,
  uploads, tracking, admin).

The mobile layout (bottom tab bar) and web layout (sidebar) are both real,
always-mounted DOM trees toggled by a single CSS breakpoint at **1024px** in
`src/app/app.css` — no JS viewport detection.

### Auth

Supabase Auth, wired through `src/lib/session/SessionContext.tsx`. Owners
sign up with `supabase.auth.signUp()` and log in via `POST /api/auth/login`
(which immediately signs a disabled boutique's owner back out); Google OAuth
via `signInWithOAuth`. Admins are seeded only, gated by the `admins` table
through the `current_admin_self()` RPC. Customers never authenticate.

### Tenant isolation

Row Level Security on every tenant-scoped table (`boutiques`, `customers`,
`orders`, `files`), keyed directly off `boutique_id`, backed by
`current_boutique_id()` / `current_boutique_status()` / `is_admin()` /
`current_admin_role()` helpers. See `docs/decisions.md` for the status and
role permission matrices.

### File uploads

Presigned-URL flow: `POST /api/uploads/presign` (authorise + create a `files`
row + return a short-lived R2 PUT URL) → the browser uploads directly to R2 →
`POST /api/uploads/confirm` → `GET /api/files/:id/download-url` for viewing.
Object keys are tenant-scoped: `boutiques/{boutiqueId}/logo/{fileId}.{ext}`
and `boutiques/{boutiqueId}/orders/{orderId}/cloth/{fileId}.{ext}`.

### Customer tracking

`GET /api/track/:token` involves no Supabase session: it calls the
`get_order_tracking(token)` Postgres function (`SECURITY DEFINER`, returns
only the safe columns the tracking page needs) and — only server-side — turns
the R2 object key into a presigned GET URL. A wrong token gets a generic 404.

### Data layer

`src/lib/data/*` is the only thing screens read or write through — one module
per resource. Reads go through the RLS-scoped Supabase client; writes that
need privilege go through the API routes. There is no mock-data mode.

## Android app

`android/` is an Expo + React Native WebView shell that loads the production
web app and ships as a directly-shared APK (version 1.1.1, not on Google
Play). It adds no screens, backend, auth or storage of its own — web deploys
reach Android users without a new APK. See `android/README.md` for building,
distribution, native features (Google sign-in via browser tab, voice input
for measurements) and the update model.

## Landing page

`/landing` is a standalone marketing page: light plum/blush theme using only
the app's own tokens, animated inline SVG illustrations, factual copy, and a
download CTA — a QR card (its modules assemble in a slow 3D vortex, then
hold perfectly still to scan; sparse red particles drift past) plus a direct
link to the Expo build — that anchors to `#download`. It is not linked from
the app itself. Design brief, copy deck and workflow: `docs/Landing page.md`.
If the download URL changes, update `DOWNLOAD_URL` in
`src/components/landing/download.ts`.

## Deployment

Netlify, via `netlify.toml`: build `npm run build`, publish `.next`, with
`@netlify/plugin-nextjs` registered explicitly (required — see the comments
in that file).

## Documentation

| Document | Contents |
| --- | --- |
| `docs/decisions.md` | every design decision, with rationale |
| `docs/phase1-report.md` … `phase4-report.md` | build reports: backend, UI, integration, QA/security audit |
| `docs/security-audit-report.md` | security audit findings |
| `docs/live-verification-report.md` | what still needs a machine with real internet, and the exact checks to run |
| `docs/Landing page.md` | landing page brief, design system notes, copy deck |
| `android/README.md` | the Android shell |

## Known limitations

- **Svetze display font** is bundled under a personal-use licence. A
  commercial licence is a pre-launch blocker.
- **Live verification has never run.** The environments this was built in
  have no outbound internet, so live RLS/HTTP/auth/E2E runs were not
  attempted — `docs/live-verification-report.md` lists exactly what to run
  from a normal machine.
- **Google OAuth provider** and the **"Confirm email"** setting are founder
  decisions still unconfigured (see `docs/phase4-report.md`).
- The landing page's download URL points at an Expo build behind an
  expo.dev login — an open item in `docs/Landing page.md`.

## License

The source code in this repository is available under the
[MIT License](LICENSE).

The Boutiqo name, logo, site copy, illustrations, and documentation content
are **not** covered by that licence and remain © 2026 SidsVictus — all
rights reserved. See [LICENSE](LICENSE) for the full terms, including the
excluded-materials notice. Third-party dependencies keep their own
licences, and font binaries are not shipped with this repository
(`public/fonts/README.md`).
