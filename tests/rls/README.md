# RLS / auth / business-rule integration tests

These tests sign in as the seeded dev accounts (see `scripts/seed.ts`) over real
HTTP against your Supabase project and exercise the exact same Row Level Security
policies, triggers and RPCs the app uses. They need:

1. `npm run seed` already run against the target project (or equivalent seed data —
   two boutique owners `owner1@boutiqo.dev` / `owner2@boutiqo.dev` and four admins
   `admin.owner@boutiqo.dev`, `admin.support@boutiqo.dev`, `admin.billing@boutiqo.dev`,
   `admin.viewer@boutiqo.dev`, all with password `Boutiqo-Dev-2026!`).
2. `.env.local` filled in with real `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Outbound network access to `*.supabase.co`.

## Why these aren't in the default `npm test` run

This project was developed inside a sandboxed session whose egress policy blocks
outbound HTTPS to `supabase.co` (see `docs/phase1-report.md` → "Known limitations").
The exact assertions in `boutique-rls.test.ts` were instead verified directly against
the live database using `SET LOCAL ROLE` + `request.jwt.claim.sub` session
simulation — a standard, Supabase-documented technique for testing RLS policies at
the SQL level without a real HTTP round-trip. That verification is recorded with its
actual output in `docs/phase1-report.md`.

This file exists so a developer with normal network access can reproduce the same
checks over real HTTP (real `signInWithPassword`, real JWTs, real PostgREST). Run
with `npm run test:rls` once the prerequisites above are met.
