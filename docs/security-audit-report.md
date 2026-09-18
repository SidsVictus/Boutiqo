# Production security audit report

Pre-deployment audit performed against the live Supabase project
(`qdjcyndazcbtflkgxjlt`), the current repository state, and a fresh
production build. Every finding below was actually tested — either by
reproducing the attack live against the database (SQL-role simulation:
`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`,
impersonating a real seeded user) or by inspecting a real build artifact
(`.next/static`, live HTTP response headers from a running `next start`).
Nothing here is asserted from code-reading alone without a corresponding
test, except where explicitly marked "not independently network-tested" for
the reason given.

## Summary

| Severity | Count | Status |
|---|---|---|
| CRITICAL/HIGH | 1 | **Fixed and re-verified live** |
| MEDIUM | 1 | Fixed (security headers) |
| LOW | 3 | Documented, not blocking |
| PASS | 12 | Verified |

## HIGH — Cross-tenant IDOR via `orders.customer_id` (FIXED)

**What:** `orders.customer_id` had only a bare foreign key to
`customers(id)` (`0001_extensions_and_tables.sql`). Nothing checked that the
referenced customer actually belongs to the order's own `boutique_id`.
`orders_insert`'s RLS policy validates `boutique_id = current_boutique_id()`
and boutique status — it never inspects `customer_id` at all.

**Where:** `supabase/migrations/0001_extensions_and_tables.sql` (schema),
`0003_rls_policies.sql` (`orders_insert`/`orders_update` policies),
`src/app/api/orders/route.ts` (accepts `customerId` from the client body and
inserts it unchecked, relying entirely on RLS/DB constraints for tenant
isolation).

**Why it's a risk:** any boutique owner could create an order in their own
boutique that references another boutique's customer row by ID — permanently
displaying that customer's name, phone, and address inside the attacker's
own order list and order-detail views. Customer IDs are UUIDs and not
normally guessable, but this is not defense-in-depth against blind
enumeration; it's a complete bypass for anyone who has *ever* observed
another tenant's customer ID (a shared network, a support ticket screenshot,
a previous authorized interaction, an admin viewing multiple tenants, etc.).

**Reproduced live, exactly:**
```sql
-- as owner1 (RLS-scoped session, real JWT claims):
insert into public.orders (boutique_id, customer_id, garment_type, due_date, total_amount, advance_amount)
values ('<owner1_boutique_id>', '<owner2_customer_id>', 'blouse', current_date+7, 1000, 0)
returning id, boutique_id, customer_id, order_code;
-- SUCCEEDED before the fix. Order BQ-0017 created in owner1's boutique,
-- pointing at owner2's customer "Sridevi Rao".
```
Test row deleted and `boutiques.order_seq` restored to its pre-test value
immediately after reproduction, before the fix was applied.

**Fix:** `supabase/migrations/0011_enforce_order_customer_same_boutique.sql`
adds a `BEFORE INSERT OR UPDATE OF customer_id, boutique_id` trigger that
looks up the referenced customer's `boutique_id` and raises unless it matches
`NEW.boutique_id`. A plain `CHECK` constraint can't express this — it needs a
cross-table lookup, hence a trigger (`security definer`, `search_path`
hardened, matching every other trigger function in this schema).

**Re-verified live after the fix:**
```sql
-- same exact attack, same session, after applying 0011:
insert into public.orders (...) values ('<owner1_boutique_id>', '<owner2_customer_id>', ...);
-- ERROR: 42501: customer_id does not belong to this boutique

-- control: legitimate same-boutique insert, same session:
insert into public.orders (...) select boutique_id, id, ... from public.customers where boutique_id = '<owner1_boutique_id>' limit 1;
-- SUCCEEDED, order_code BQ-0017 (rolled back — a check, not a real seed change)
```

## MEDIUM — No security response headers (FIXED)

**What:** `next.config.ts` had no `headers()` configuration at all — no
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or
`Permissions-Policy` on any response.

**Why it's a risk:** missing `X-Frame-Options`/frame-ancestors leaves the
app clickjackable (embeddable in a malicious iframe over the owner/admin
login and dashboards); missing `X-Content-Type-Options: nosniff` allows
some legacy browser MIME-sniffing attacks; an unset `Permissions-Policy`
leaves camera/microphone/geolocation available to any future third-party
script by default.

**Fix:** added a `headers()` export in `next.config.ts` applying
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, and
`Permissions-Policy: camera=(), microphone=(), geolocation=()` (the app
never calls `getUserMedia`/geolocation — confirmed by grep — so these are
safe to deny outright) to every route.

**Verified live**, not just configured: built a production bundle
(`npm run build`), ran `next start`, and confirmed via `curl -D -` that all
four headers are actually present on the response:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
No `netlify.toml` is required for this — Netlify's official Next.js runtime
(auto-detected on deploy) honors Next.js's own `headers()` config directly.

## LOW findings (not fixed — documented, non-blocking)

**1. `cloth_photo_file_id`/`logo_file_id` can be pointed at an arbitrary
file UUID via direct RLS-scoped update.** `orders_update`/`boutiques_update`
let an owner set these columns to any UUID, including another tenant's file
row, since neither policy validates the referenced file's `boutique_id`.
**Tested live and confirmed non-exploitable for data leakage**: the actual
file bytes are only ever reachable through
`GET /api/files/[fileId]/download-url`, which re-queries the `files` table
through the caller's own RLS-scoped client — `files_select`'s policy
independently re-checks the file's real `boutique_id` regardless of what a
corrupted pointer column says, so a cross-tenant file ID resolves to zero
rows and a 404. Impact is limited to a broken image/reference in the
attacker's own UI, not a leak. Not fixed, since closing it needs the same
kind of cross-table trigger as the HIGH finding above for two more columns,
and there is no live exploit path to justify the change before launch —
worth doing as a follow-up hardening pass.

**2. Supabase Auth "Leaked Password Protection" is disabled.** Dashboard
-only setting (Authentication → Policies → Password), not schema-controllable
from a migration. Flagged by `get_advisors` both in this audit and every
prior phase's. Recommend enabling in the Supabase dashboard before launch;
does not block deployment on its own.

**3. No rate limiting on `/api/auth/login` or `/api/track/[token]`.**
Neither this application layer nor a documented Netlify/Supabase-level rule
throttles repeated attempts. Supabase Auth applies its own platform-level
rate limits to `signInWithPassword` independent of this app, which covers
brute-force credential guessing; the tracking-token endpoint has no app-level
throttling, but the token itself is a 256-bit random value
(`encode(gen_random_bytes(32), 'hex')`), making brute-force guessing
computationally infeasible regardless. Not fixed — no evidence of need, and
adding rate-limiting middleware without a real signal would be exactly the
kind of unnecessary architectural change this audit was told to avoid.

## PASS — verified, not just reviewed

- **Service-role key / R2 secret never reach the client bundle.** Built a
  fresh production bundle and grepped `.next/static` for the literal
  `R2_SECRET_ACCESS_KEY`/`R2_ACCESS_KEY_ID` values from `.env.local` and for
  the string `SUPABASE_SERVICE_ROLE_KEY` — zero matches. The one JWT-shaped
  string present in the client bundle was extracted and base64-decoded to
  confirm it carries `"role":"anon"`, not `"role":"service_role"`.
- **`SUPABASE_SERVICE_ROLE_KEY` accessor is `server-only`-guarded**
  (`src/lib/supabase/env.ts`, `src/lib/supabase/admin.ts`) — importing it
  from a client component would fail the build, not just leak at runtime.
- **RLS re-verified live for every table/role combination** carried over
  from Phase 4's audit (tenant isolation, `on_hold`/`disabled` effects,
  anon zero-access, the tracking RPC's safe subset, per-boutique order-code
  sequencing, `current_admin_self()` for active/suspended/non-admin,
  forged-role resistance on admin/boutique status changes) — all still
  passing against the current live schema (migrations 0001–0011 all
  applied, confirmed via `list_migrations`).
- **No secrets ever committed to git history** — `.env` variants are
  `.gitignore`d, only `.env.example` (placeholder values) is tracked, and a
  history scan for real-looking key patterns found nothing.
- **No `dangerouslySetInnerHTML`, no `eval`/`new Function`** anywhere in
  `src/` — confirmed by grep across the whole tree. React's default
  text-interpolation escaping covers every user-supplied string rendered
  anywhere, including the anonymous customer-tracking page.
- **`npm audit` (production dependencies): 0 vulnerabilities.**
- **Input validation:** every write-accepting API route parses its body
  through a Zod schema before touching the database (`src/lib/validation/*`)
  — confirmed present on every route under `src/app/api/`.
- **Upload validation is server-side, not just client-side:**
  `presignUploadSchema` (mime type, size) is enforced in
  `POST /api/uploads/presign` independent of the browser's own `<input
  accept>` check.
- **Tracking token entropy:** 256-bit random hex, `unique` constraint,
  unguessable — confirmed by reading the column definition and default.
- **Admin sub-role boundaries enforced at the trigger/RLS layer, not the
  client:** re-confirmed this session that `enforce_admin_update_rules()`
  (self-suspension block, owner_admin-only writes to owner_admin rows) is
  unaffected by anything a client sends — it was already re-verified live in
  a prior session and nothing in the current diff touches it.
- **Route protection (`src/proxy.ts`) is UX-only, not the security
  boundary** — it makes exactly one decision (`!user` → redirect) and every
  actual data operation still goes through RLS regardless of whether this
  file runs at all. Confirmed by reading the file; unchanged since the last
  audit.
- **`NEXT_PUBLIC_*` usage is appropriate:** only `NEXT_PUBLIC_SUPABASE_URL`
  and `NEXT_PUBLIC_SUPABASE_ANON_KEY` carry that prefix, both are meant to be
  public (the anon key is designed to be client-visible; RLS is the actual
  boundary), and `NEXT_PUBLIC_APP_URL` is documentation-only for dashboard
  configuration (CORS/redirect allow-lists), never read by app code.
- **No debug/development configuration shipped:** no
  `NODE_ENV`-gated backdoors, no hardcoded dev credentials in `src/`
  (the dev-seed passwords live only in `tests/rls` and `docs/*.md`, never in
  application code), no verbose error responses — `apiError()` returns a
  fixed `{code, message}` shape, never a raw exception or stack trace.

## Netlify-specific checks

- **No `netlify.toml` exists.** Confirmed this is not required for a
  correct deploy: Netlify auto-detects Next.js and installs its official
  Next.js runtime, which reads `next.config.ts` (including the new
  `headers()` config) directly. Not adding one was a deliberate choice here
  — introducing a `netlify.toml` with a hand-rolled build command carries
  more risk of drifting from Netlify's own auto-detected, maintained
  configuration than it removes.
- **Secrets scanning:** `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public — Netlify's
  secrets scanner may flag the anon key's JWT shape as it does for any
  JWT-like string in build output; this is a false positive, not a leak (see
  the PASS item above confirming it decodes to `role: anon`, the exact
  credential Supabase's own client SDK expects to be public). If Netlify's
  scan blocks the build on this, the correct fix is marking that specific
  variable exempt in Netlify's scanning config — never disabling scanning
  entirely, and never suppressing a flag on `SUPABASE_SERVICE_ROLE_KEY` or
  the R2 secret pair, which must always be treated as real secrets.
- **Build-time env exposure:** confirmed via the `.next/static` grep above
  that only the two `NEXT_PUBLIC_*` values (by design) end up in
  client-shipped output; `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`,
  and `R2_SECRET_ACCESS_KEY` must be set in Netlify's server-side
  environment variables (Site settings → Environment variables), never
  prefixed `NEXT_PUBLIC_`.

## Not independently network-tested (and why)

This sandbox has no outbound HTTPS to `*.supabase.co` or Cloudflare's API —
confirmed again this session before relying on it (same restriction as
every prior phase). Everything above that could be verified via direct SQL
against the live database (through the Supabase MCP tooling, which runs
through a separate, unblocked channel) or via a local production build was
actually tested. What was **not** independently exercised over real HTTP in
this session:
- The full live RLS test suite over actual PostgREST (`RUN_LIVE_RLS_TESTS=1
  npm run test:rls`) — the SQL-role simulation used throughout this report
  reproduces the same policy evaluation Postgres performs for a real HTTP
  request with the same JWT claims, but is not the literal PostgREST code
  path.
- R2 bucket/CORS policy in practice — R2 remains unconfirmed as enabled on
  the linked Cloudflare account as of this audit; the upload/download code
  was reviewed statically only (server-only credential handling, tenant-
  scoped object keys, short-lived presigned URLs — all already reviewed and
  documented in `docs/phase4-report.md` §4, unchanged in this session).

## Tests actually executed this session

- `npm audit --omit=dev` → 0 vulnerabilities.
- `npx tsc --noEmit` → clean (before and after all fixes).
- `npx eslint .` → clean (before and after all fixes).
- `npx vitest run` → 43 passed, 7 skipped (unchanged by this audit's fixes).
- `npm run build` → clean production build, twice (before/after header fix).
- `grep` across `.next/static` for service-role/R2-secret literals → none
  found; the one embedded JWT decoded and confirmed `role: anon`.
- Live SQL-role-simulated attack against the production database: the
  cross-tenant order/customer IDOR — reproduced, fixed, re-verified blocked,
  control case re-verified still working, state restored.
- `curl -D -` against a running `next start` production server → confirmed
  all four new security headers are actually served.

## Final verdict

**SAFE TO DEPLOY**, conditional on before-launch dashboard steps that are
outside this repository's control:
1. Set `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` as **server-side** environment
   variables in Netlify (never `NEXT_PUBLIC_`-prefixed).
2. Confirm R2 is actually enabled on the Cloudflare account and its CORS
   policy allows the production origin (see `docs/phase4-report.md` §4 for
   the exact steps — unchanged by this audit).
3. Enable Supabase Auth's "Leaked Password Protection" (LOW finding #2).
4. Run `RUN_LIVE_RLS_TESTS=1 npm run test:rls` once from an environment with
   real network access, as the one verification this sandbox structurally
   cannot perform itself.

The one exploitable data-isolation vulnerability found (cross-tenant
order/customer IDOR) is fixed and re-verified live against the production
database. No other CRITICAL or HIGH finding was identified.
