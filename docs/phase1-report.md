# Phase 1 completion report — Supabase + Cloudflare R2 backend

Status: **complete**, with the network-access limitations below documented
rather than glossed over. Everything claimed here was actually run and
observed in this session; where something could not be run, that is stated
explicitly rather than assumed to work.

## 0. Repository state before this work

Empty except a two-line `README.md` and git history. No Next.js project, no
Supabase config, no R2 config. A Supabase project named "Boutiqo"
(`qdjcyndazcbtflkgxjlt`) already existed in the linked organization, empty
(0 tables) — this phase built entirely inside it rather than creating a new
one.

## 1. What was built

- Next.js 16 (App Router) + TypeScript (strict) project, minimal — only
  `src/app/api/**` route handlers and one placeholder home page. No product
  UI; that's Phase 2.
- 8 migrations in `supabase/migrations/` (`0001`–`0008`), applied to the live
  project via the Supabase MCP `apply_migration` tool and verified with
  `list_tables`/`get_advisors`. Two of these migrations (`0006`, `0007`) are
  fixes for real bugs this phase's own testing found — see §4.
- Row Level Security on `boutiques`, `customers`, `orders`, `admins`, `files`,
  plus a `get_order_tracking()` `SECURITY DEFINER` RPC for the anon customer
  tracking path.
- 14 API route handlers covering registration, login (with disabled-boutique
  sign-out), customers, orders (create/stage/mark-paid), uploads
  (presign/confirm/download-url), the tracking page, and admin actions
  (add boutique, change status, suspend/reactivate an admin).
- `src/lib/r2.ts`: R2 client, tenant-scoped object-key builder, presigned
  PUT/GET, delete.
- Zod schemas for every input listed in the brief's §9.
- `scripts/seed.ts`: the production-correct seed script (uses the service
  role key + `auth.admin.createUser()`), for anyone with normal network
  access to run.
- Test suite: `tests/unit` (Zod schemas), `tests/r2` (real S3-protocol flow
  against a local mock), `tests/rls` (live HTTP RLS tests, opt-in — see §3).
- `docs/decisions.md` (the 5 open questions + 2 more, resolved and
  documented), this report, `.env.example`, `.gitignore`.

## 2. Known limitations (environment, not implementation)

This session's outbound network is restricted by an organizational egress
policy (`/root/.ccr/README.md`): only an explicit allowlist of hosts is
reachable (npm, GitHub, Anthropic, etc.). **`*.supabase.co` and
`*.r2.cloudflarestorage.com` are not on that allowlist** — every attempt
returned a proxy-level `403` (`gateway answered 403 to CONNECT`), which the
proxy's own documentation is explicit about: *"Do not retry or route around
it — report the blocked host."* This is reported here rather than routed
around. Concretely, this session could not:

- Run `next dev`/`next start` and hit its own API routes over real HTTP
  against the live Supabase project (the app needs exactly the network path
  that's blocked).
- Call Supabase Auth's HTTP signup/login endpoints directly (`supabase.auth.signUp`,
  `signInWithPassword`) from a script in this sandbox.
- Reach Cloudflare R2's data-plane endpoint at all, even if R2 had been
  enabled (see next point) — the control-plane MCP tool
  (`mcp__Cloudflare_Developer_Platform__r2_buckets_list`) reached Cloudflare
  fine and reported R2 itself is **not enabled** on this account
  (`"Please enable R2 through the Cloudflare Dashboard"` — a one-time human
  step in the dashboard, not scriptable).

**What this changed, and why the substitute is legitimate, not a shortcut:**

- **RLS, triggers, business rules, and the tracking RPC** were verified
  directly against the live database via the Supabase MCP's `execute_sql`
  tool, using `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claim.sub', ...)`
  to simulate each seeded user's session — this is a standard, Supabase-
  documented technique for testing RLS policies without a live HTTP round
  trip (the same `auth.uid()`/`auth.role()` functions the real API path
  uses read from exactly those settings). Every policy, trigger and the RPC
  ran for real, against the real schema, with real seeded rows — only the
  transport (SQL protocol vs. HTTPS/PostgREST) differs from what a browser
  would do. Full transcript in §5.
- **Auth users** for the seed/test accounts were created directly via SQL
  (`crypt(password, gen_salt('bf'))` through the already-enabled `pgcrypto`
  extension) rather than through GoTrue's signup endpoint, since that
  endpoint was unreachable. This is a known technique for seeding
  Supabase Auth without the HTTP API; a real deployment's own signups go
  through the normal `/api/auth/register` route, unaffected by this.
- **R2 upload/download** was verified against `s3rver`, a local
  S3-protocol-compatible test server, using the exact same `src/lib/r2.ts`
  code the app uses (only `R2_ENDPOINT` differs). 11 tests, all real HTTP
  PUT/GET/DELETE round-trips — see §6. Live Cloudflare R2 needs a human to
  enable it in the dashboard first regardless of network access; once that's
  done and real credentials are in `.env.local`, the same code targets it
  with no changes.

Everything else (schema design, RLS policy design, Zod validation, route
handler logic, TypeScript compilation, `next build`, ESLint) was run and
verified normally in this session.

## 3. Auth — what was and wasn't verified

**Verified (live, real DB):**
- Auth users exist for all 6 dev accounts (2 owners, 4 admins), correctly
  linked to their `boutiques`/`admins` rows via `owner_user_id`/`user_id`.
- `is_admin()` correctly returns false for an inactive admin (`admin.viewer`,
  seeded suspended) even though the row exists — confirmed via the SQL-role
  simulation (`admin.viewer` sees 0 boutiques where an active admin sees 2).
- The disabled-boutique-blocks-login logic in `/api/auth/login/route.ts` was
  reviewed and unit-reasoned (it signs the session back out immediately if
  the linked boutique is disabled) but **not exercised over HTTP** in this
  session — see limitation above.

**Not verified in this session (needs a normal network environment):**
- `POST /api/auth/register` and `POST /api/admin/boutiques` end-to-end over
  HTTP (both need `SUPABASE_SERVICE_ROLE_KEY`, which the Supabase MCP
  tooling available here deliberately does not expose — by design, for
  safety). Their logic was validated by hand and by the equivalent direct-SQL
  operations performed for seeding (same inserts, same constraints), but not
  through the actual route handler over HTTP.
- Google OAuth (no client UI exists yet in Phase 1 to exercise it; Phase 2
  work).
- `tests/rls/boutique-rls.test.ts` reproduces the sign-in-based checks for
  when a real environment is available (`npm run test:rls`).

## 4. Bugs found and fixed during this phase's own testing

Testing is only useful if it can fail. It did, twice, on real logic bugs —
both fixed and re-verified before moving on:

1. **`enforce_boutique_update_rules()` blocked its own system-internal
   update.** `generate_order_code()` increments `boutiques.order_seq` via a
   plain `UPDATE`, which re-entered the trigger meant to stop owners/admins
   editing `order_seq` directly — and always rejected it, since the
   internal update session is never "the owner" or "an admin" of that row.
   Every order creation failed with `order_seq is managed by the system`.
   Fixed in `0006_fix_order_seq_trigger_conflict.sql`: the guard now only
   blocks changes that aren't the one legitimate `+1` increment.
2. **Over-aggressive privilege revocation broke order creation.**
   `0005`'s hardening pass revoked `EXECUTE` on `generate_order_code()` from
   `authenticated` (reasonable-looking defense-in-depth, modeled on the
   trigger-only functions) — but the order-code trigger calls it as the
   invoking role (no `SECURITY DEFINER` in that chain), so every real order
   insert then failed with `permission denied for function
   generate_order_code`. Fixed in `0007_fix_generate_order_code_privileges.sql`.
3. **RLS policies weren't scoped `TO authenticated`.** Every owner/admin
   policy applied to `public` (all roles) by default, so `anon` queries
   against `orders`/`customers`/`boutiques`/`admins` hit `permission denied
   for function current_boutique_id` (anon correctly has no `EXECUTE` on
   that helper) instead of a clean, silent "0 rows." Not a security hole —
   the net access was still nothing — but genuinely wrong behavior for a
   defense meant to be transparent to a legitimately-scoped anon caller.
   Fixed in `0008_scope_policies_to_authenticated.sql`.

All three were caught precisely because the test plan checked both the
allow and the deny side of every policy against a real, running database
instead of only reading the SQL and assuming it was correct.

## 5. RLS / business-rule test transcript (live, via SQL-role simulation)

Seeded state: `owner1@boutiqo.dev` owns "Meera Boutique" (2 customers, 6
seed orders across all 5 stages + 1 overdue-by-derivation); `owner2@boutiqo.dev`
owns "Silk Story" (1 customer, 1 order — the tracking-token demo order); 4
admins, one per role, `admin.viewer` seeded inactive.

| # | Check | Method | Result |
|---|---|---|---|
| 1 | owner1 sees exactly 1 boutique (own) | as owner1 | ✅ count=1 |
| 2 | owner1 sees only own 2 customers | as owner1 | ✅ `[Aisha Fatima, Meghana Reddy]` |
| 3 | owner2 sees only own 1 customer, 1 order | as owner2 | ✅ `[Sridevi Rao]`, `[BQ-0001]` |
| 4 | owner1 cannot INSERT a customer into owner2's boutique | as owner1 | ✅ rejected: `new row violates row-level security policy for table "customers"` |
| 5 | owner2 cannot UPDATE owner1's order | as owner2 | ✅ 0 rows affected |
| 6 | support_admin (active) sees all boutiques | as admin.support | ✅ count=2 |
| 7 | viewer admin (inactive) sees 0 boutiques via admin path | as admin.viewer | ✅ count=0 |
| 8 | support_admin cannot **disable** a boutique | as admin.support | ✅ rejected: `Support admins cannot disable a boutique` |
| 9 | support_admin **can** put a boutique on hold | as admin.support | ✅ succeeded |
| 10 | billing_admin cannot change status at all | as admin.billing | ✅ rejected: `Billing admins cannot change boutique status` |
| 11 | owner cannot change their own boutique's status | as owner1 | ✅ rejected: `Boutique owners cannot change their own account status` |
| 12 | on_hold blocks a NEW order | as owner1, boutique on_hold | ✅ rejected: RLS policy violation |
| 13 | on_hold still allows updating an EXISTING order's stage | as owner1, boutique on_hold | ✅ succeeded |
| 14 | on_hold still allows creating a customer | as owner1, boutique on_hold | ✅ succeeded |
| 15 | disabled blocks all reads (customers, orders) | as owner1, boutique disabled | ✅ count=0 for both |
| 16 | support_admin cannot suspend/reactivate an admin | as admin.support | ✅ 0 rows updated |
| 17 | owner_admin CAN reactivate a suspended admin | as admin.owner | ✅ succeeded (rolled back to preserve seed state) |
| 18 | anon has zero direct access to orders/customers/boutiques/admins | as anon | ✅ count=0 for all four |
| 19 | `get_order_tracking` with a valid token returns exactly the safe subset, correct boutique | as anon | ✅ returned order_code, garment_type, effective_stage, amounts, boutique name/phone — verified against **both** seeded boutiques' own tokens, each returning only its own boutique's name/phone |
| 20 | `get_order_tracking` with an invalid/all-zero/short/null token | as anon | ✅ 0 rows every time, no error, no distinguishing behavior |
| 21 | Per-boutique order code sequencing, no cross-tenant collision | direct insert | ✅ boutique1 → `BQ-0001..BQ-0006`, boutique2 independently → `BQ-0001` |
| 22 | Order-code generation under rapid repeated inserts (concurrency proxy) | 10-row batch insert, same boutique | ✅ `BQ-0007..BQ-0016`, all unique, no gaps, no collisions — this exercises the same row-locked `UPDATE...RETURNING` a real concurrent-transaction race would hit; genuine multi-connection parallel load testing wasn't possible in this network-restricted sandbox (direct Postgres TCP access is also outside the allowlist), but the underlying mechanism is the standard textbook technique for exactly this guarantee. `npm run test:rls`'s environment (real network) can additionally fire concurrent `Promise.all` inserts if stronger evidence is wanted. |

State was restored to the original seed after every test (either via
`ROLLBACK` for pure checks, or an explicit revert `UPDATE` for the two tests
that legitimately needed a committed state change to test against — boutique1's
status was taken to `on_hold` then `disabled` then back to `active`; the
10 batch-insert orders were deleted afterward). Final state verified to match
the original seed exactly before moving on.

## 6. R2 test results (local S3-protocol mock, `tests/r2/r2.test.ts`)

Run: `npx vitest run tests/r2` → **11 passed**.

- `buildObjectKey`: correct tenant-scoped paths for both kinds; never reuses
  a file id across calls.
- Authorized upload (presigned PUT) then authorized download (presigned GET)
  round-trips the exact bytes.
- Downloading a missing object → 404.
- An expired presigned URL (1s TTL, waited 1.5s) → rejected.
- Delete then download → 404 (not silently still there).
- Zod (`presignUploadSchema`): rejects a disallowed mime type, rejects an
  oversized file, accepts every allowed mime type at exactly the size
  boundary, rejects `orderId` on a `boutique_logo` payload and requires it
  on a `cloth_photo` payload (schemas made `.strict()` after this surfaced
  that non-strict Zod objects silently ignore unexpected fields).
- Not asserted: an unauthenticated bare GET being denied by bucket policy —
  `s3rver` treats a request with no auth mechanism as anonymous-allowed by
  default (a mock limitation, documented inline in the test file), whereas a
  real R2/S3 bucket denies it. The presigned-URL-only design this code
  implements means no code path ever offers an unauthenticated URL in the
  first place, so this gap is in the mock's fidelity, not in coverage of the
  app's actual behavior.

## 7. Zod validation tests (`tests/unit/validation.test.ts`)

Run: `npx vitest run tests/unit` → **16 passed.** Covers: boutique
registration (valid case, missing name, malformed GST), terms acceptance
(both checkboxes required, literally, not just truthy), customer creation
(name-only valid, empty name rejected, malformed phone rejected),
measurements (all-empty valid, rounds to 1 decimal, out-of-range rejected),
order creation (minimal valid order, advance-exceeds-total rejected,
"Other" garment type requires a description, invalid date rejected,
negative total rejected).

## 8. Full suite + build/lint

```
npx vitest run   → Test Files  2 passed | 1 skipped (3)
                    Tests  27 passed | 7 skipped (34)
npx tsc --noEmit → clean
npx eslint .     → clean
npm run build    → succeeds, all 14 API routes compiled
```

The 1 skipped file / 7 skipped tests are `tests/rls/boutique-rls.test.ts`,
gated behind `RUN_LIVE_RLS_TESTS=1` because they need real network access to
Supabase (see §2). They are not a stand-in for the tests in §5 — §5 already
verified the exact same policies live; this file exists so a normal
development machine can additionally reproduce those checks over real HTTP.

## 9. Security review

| Item | Status |
|---|---|
| Service-role key never client-side | ✅ `src/lib/supabase/admin.ts` is `import "server-only"`; only imported from route handlers, never from anything under a client boundary |
| R2 secret key / Cloudflare tokens never client-side | ✅ `src/lib/r2.ts` is `import "server-only"`; env vars have no `NEXT_PUBLIC_` prefix |
| RLS enabled on every tenant/order/customer/admin/file table | ✅ confirmed via `list_tables` (`rls_enabled: true` on all 5) |
| RLS tested, allow + deny, including admin sub-roles | ✅ §5, 22 cases |
| Cross-tenant access denied in practice | ✅ §5 #3–5 |
| Tracking token path can't enumerate/access beyond its one order | ✅ §5 #19–20; 256-bit token entropy (32 random bytes, hex) makes brute-forcing impractical regardless |
| Presigned URLs short-lived and scoped | ✅ 5-minute TTL (`src/lib/r2.ts`), one object key each, verified to expire (§6) |
| R2 CORS not wildcarded | ⚠️ documented required config in README (must be set in the Cloudflare dashboard once a real bucket exists — not scriptable from here since R2 isn't enabled on this account) |
| Upload validation rejects disallowed types/sizes server-side | ✅ enforced in 3 independent places: DB CHECK constraints, `src/lib/r2.ts` constants, Zod schema (§6, §7) |
| No secrets committed to git | ✅ `.gitignore` excludes `.env`/`.env.local`/etc.; `.env.example` has placeholders only; verified `git check-ignore` on `.env.local` |
| Admin sub-role boundaries enforced, not just displayed | ✅ §5 #6–10, #16–17; enforced in a `BEFORE UPDATE` trigger + RLS, not application code that a direct API call could bypass |
| Function search_path hardened | ✅ `set search_path = public` on every trigger/helper function (Supabase advisor flagged this before `0005`; clean after) |
| Supabase advisor findings reviewed | ✅ remaining `WARN`s are the *intended* exposure: `authenticated` users can call the 4 identity-helper RPCs (that's their purpose), `anon` can call `get_order_tracking` (that's the entire point of the no-login tracking page). One informational finding — "leaked password protection disabled" — is a dashboard Auth setting, not schema-controllable; recommended as a follow-up in README |

## 10. Open questions — resolved

See `docs/decisions.md` for the full writeup with schema/RLS references. Summary:

1. Overdue is derived, never stored.
2. Order code sequencing is per-boutique.
3. `on_hold` blocks only new orders; `disabled` blocks everything, including
   login (server-side, not just a UI decision).
4. Owner self-signup and admin-add are two independent, equally-valid paths
   into the same `boutiques` table.
5. `billing_admin` role exists and is enforced but has no platform-billing
   surface to protect yet — expected, not a gap, since no such surface is in
   the design's 25 screens.

Plus two decisions the brief left to this phase's judgment: measurements are
14 structured numeric columns (not jsonb), and file uploads are capped at
10MB / `image/jpeg,png,webp,heic`.

## 11. Environment variables (names only)

See `.env.example` for the full list with comments: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`
(test-only override), `NEXT_PUBLIC_APP_URL`.

## 12. Development-only test accounts

All passwords: `Boutiqo-Dev-2026!`. **Never use these in production.**

| Email | Role | Notes |
|---|---|---|
| `admin.owner@boutiqo.dev` | owner_admin | full access |
| `admin.support@boutiqo.dev` | support_admin | can hold/activate, not disable |
| `admin.billing@boutiqo.dev` | billing_admin | cannot touch boutique status |
| `admin.viewer@boutiqo.dev` | viewer | seeded **inactive/suspended** |
| `owner1@boutiqo.dev` | boutique owner | "Meera Boutique" — 2 customers, 6 orders across all 5 stages + 1 overdue-by-derivation |
| `owner2@boutiqo.dev` | boutique owner | "Silk Story" — 1 customer, 1 order (has the demo tracking token) |

One order's tracking token (Silk Story's `BQ-0001`) is recorded in this
session's transcript for `GET /api/track/:token` testing; `npm run seed`
prints a fresh one each run.

**Note on how these were created:** in a normal environment, `npm run seed`
creates all of the above via the service-role key. In this network-restricted
session (no service-role key available — see §2), the equivalent live state
was created directly against the database via the Supabase MCP's
`execute_sql` tool (auth users via `pgcrypto`-hashed passwords, business rows
via direct `INSERT`) and is live in the `qdjcyndazcbtflkgxjlt` project right
now.

## 13. What Phase 2 needs to know

- No product UI exists. `src/app/page.tsx` is a one-line placeholder.
- Every backend capability Phase 2's screens need already has a route (see
  README → Architecture summary) except: Google OAuth is not wired up
  (needs a Supabase Auth provider config step + client-side redirect flow,
  both Phase 2 concerns), and there's no customer/order list/detail/update
  UI yet (routes exist, screens don't).
- The 25 screens' stage colors, copy rules, and the two-layout (mobile/web)
  system are entirely a Phase 2 concern — nothing here assumes a particular
  UI framework beyond "a Next.js app that can call these routes."
- `docs/decisions.md` is required reading before building the dashboard,
  calendar, or stage-update screens — the overdue-derivation and per-boutique
  order numbering decisions directly affect what those screens can assume.
- If R2 gets enabled on the Cloudflare account before Phase 2 starts, re-run
  `npm run seed` with real credentials to get real seeded photos/logos (this
  phase's seed data has none — R2 wasn't enabled during Phase 1 development).
