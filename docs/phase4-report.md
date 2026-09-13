# Phase 4 — final QA, security, and production-readiness audit

This is the last phase before real users. Everything below is something this
session actually did — ran, queried, read, or fixed — not a restatement of
what Phases 1–3 claimed. Where something could not be verified in this
sandbox, it says so explicitly rather than rounding up.

## 0. Brand logo and the network constraint — resolved as instructed

**Brand logo.** Read `src/components/app/Logo.tsx` directly: it renders only
the 7px signal-red dot per the design handoff, no raster image, `size`/
`onDark` accepted but ignored. `public/brand/` does not exist
(`ls public/brand` → "No such file or directory"). `grep -rn "brand/logo\|
logo.png" src/` → no matches. **This matches the design source of truth and
is left exactly as is.** This is settled by that match, not by adjudicating
Phase 3's account of a past conversation — no future phase needs to revisit
it unless a new, current, written instruction says otherwise.

**Network.** Tested directly, not assumed: `curl` to
`qdjcyndazcbtflkgxjlt.supabase.co/auth/v1/health` → `403`, proxy status shows
`connect_rejected` / "policy denial or upstream failure" against that exact
host. This sandbox's egress policy is unchanged from Phases 1–3. What this
phase did differently: it did **not** stop there. It used the Supabase MCP's
direct-SQL channel (unaffected by the HTTP egress block) to re-run the
*entire* RLS/business-rule audit against the live database for the first
time since Phase 1 (§3), confirmed R2's status directly via the Cloudflare
MCP tool rather than trusting Phase 3's report (§4), and produced the
prioritized, actionable "what to run with real network access" list (§14)
this phase exists to deliver.

## 1. Repository and migration review

Read every migration file directly (not summaries): `0001` through `0009`,
9 files. Cross-checked against the live project's `list_migrations` — **all
9 applied, versions and names match the filesystem exactly.** No drift.

Read `docs/decisions.md` in full (added §6 in Phase 3 for the admin
self-lookup fix), all three prior phase reports, every API route handler,
all six data-layer modules, `SessionContext.tsx`, `proxy.ts`, and
`src/lib/r2.ts`.

## 2. Functional audit — regressions found and fixed

Two real, user-facing bugs were found during this pass, both in exactly the
areas the brief flagged as highest-risk (Phase 3's rewiring touched them
most recently):

### Bug 1 — a user who abandons signup before finishing registration gets stuck in a silent login loop

**Found by tracing the abandon-mid-signup scenario end to end**, not by
inspection alone. Sequence: a user calls `signUpOwner()` (creates their
`auth.users` row), is routed to `/owner/register`, but closes the tab before
finishing `/owner/register` + `/owner/terms`. `draftSignup` lives only in
React state — it's gone on reload. If they come back and log in with the
same email/password (which works — the auth user exists), `POST
/api/auth/login` returns `200 OK` with `boutique: null` (correctly, since no
boutique was ever created), but `owner/login/page.tsx` unconditionally did
`router.push("/owner/dashboard")` on any `ok` result. `owner/(app)/layout.tsx`
then sees `resolveSession()` return `null` (no admin row, no boutique row)
and bounces them back to `/owner/login` — a permanent loop with zero
indication of what's wrong and no path back to `/owner/register`.

**Fixed:**
- `SessionContext.loginOwner` now checks the login response's `boutique`
  field; if null, it re-seeds `draftSignup` (email + userId — `fields` stays
  empty, since `/owner/register` just re-collects them) and returns
  `{ ok: true, code: "registration_incomplete" }` instead of a bare `ok`.
- `owner/(auth)/login/page.tsx` checks that code and routes to
  `/owner/register` instead of `/owner/dashboard`.

Verified: `tsc --noEmit` and `eslint` both clean after the change; the logic
was traced by hand against every state transition in `resolveSession()` and
the login route since this path can't be driven by a live browser in this
sandbox (see §12's unverified-link note for this specific gap).

### Bug 2 — a failed deferred cloth-photo upload was reported to a component that had already navigated away

**Found by re-reading `orders/new/page.tsx`'s `handleSave()` line by line**,
per the brief's specific instruction to check this exact area. The deferred
upload (Phase 3's fix for the wizard/order-id mismatch) caught its own
failure and called `setError(...)` — but the very next line, in the same
function, unconditionally called `router.push(".../confirm")`. The component
carrying that `error` state was navigating away in the same tick, so the
message was set on a component about to unmount and the user never saw it.
Separately, `owner-confirm` had **no cloth-photo status indicator at all** —
so even without the setState-after-navigate bug, a user who selected a photo
had no way to tell whether it actually attached.

**Fixed:**
- `orders/new/page.tsx` now calls `flash(..., "danger")` (the toast system,
  whose provider lives above the route tree and survives `router.push`)
  instead of `setError(...)` for this one case.
- `orders/[id]/confirm/page.tsx` now shows "Cloth photo attached" or "No
  cloth photo yet — add one from the order record" based on the freshly
  fetched order's `cloth_photo_file_id`, so the confirm screen — which
  already re-fetches the order after the deferred upload completes or fails
  — reflects the real outcome either way.

Verified: `tsc --noEmit`, `eslint`, `npx vitest run` (43 passed / 7 skipped,
unchanged), and `npm run build` all clean after both fixes. Not
independently exercised in a live browser (see §12).

### Everything else walked in this pass, found correct

- **Register→terms abandonment (the other half of this check):** a user who
  abandons *after* `/owner/register` but *before* `/owner/terms` (draftSignup
  still in memory, same tab) is handled correctly — `terms/page.tsx`'s guard
  (`!draftSignup?.fields && !accepted && session?.kind !== "owner"`) only
  redirects them away if truly nothing is left to resume, and the `accepted`
  flag prevents the known Phase 2 race (redirecting to `/owner/signup` right
  as `clearDraftSignup()` fires post-success).
- **Dead code from Phase 3's own cleanup claims** — checked each one
  specifically: no reference to deleted `public/brand/` assets anywhere in
  `src/`; `src/middleware.ts` does not exist, only `src/proxy.ts`; the
  now-removed `CreateOrderInput.clothPhotoFileId` field (see §9) had zero
  call sites passing it — confirmed dead before removing it; the one
  `customerOrders()` call site (`customers/[id]/page.tsx`) already correctly
  awaits it as async.
- **`get_order_tracking` derived-overdue** — re-verified live via SQL: an
  order seeded with `stage='received'`, `due_date` in the past returned
  `effective_stage: "overdue"` from the RPC itself, confirming the
  never-stored derivation still works exactly as `docs/decisions.md` §1
  describes.

## 3. Database / RLS / business-rule audit — fully re-run against the live project

This had **not** been re-run since Phase 1; Phase 3 only spot-checked the one
bug it found. This phase re-ran every original Phase 1 case via SQL-role
simulation (`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims',
...)`) against the current live project (`qdjcyndazcbtflkgxjlt`), plus new
cases for what's been added since. State was restored to the exact original
seed after every check (verified by a final state comparison query).

| # | Check | Result |
|---|---|---|
| 1–3 | owner1/owner2 tenant isolation (boutiques/customers/orders) | ✅ matches seed exactly |
| 4 | owner1 cannot INSERT a customer into owner2's boutique | ✅ rejected: RLS violation |
| 5 | owner2 cannot UPDATE owner1's order | ✅ 0 rows affected |
| 6 | support_admin (active) sees all boutiques | ✅ |
| 8 | support_admin cannot disable a boutique | ✅ rejected: "Support admins cannot disable a boutique" |
| 9 | support_admin can put a boutique on hold | ✅ |
| 10 | billing_admin cannot change status at all | ✅ rejected |
| 11 | owner cannot change their own boutique's status | ✅ rejected |
| 12 | on_hold blocks a NEW order | ✅ rejected: RLS violation |
| 13 | on_hold still allows updating an EXISTING order's stage | ✅ |
| 14 | on_hold still allows creating a customer | ✅ |
| 15 | disabled blocks all reads (customers, orders) | ✅ count=0 for both |
| 16 | support_admin cannot reactivate a suspended admin | ✅ 0 rows changed |
| 17 | owner_admin CAN reactivate a suspended admin | ✅ (rolled back after) |
| 18 | anon has zero direct access to boutiques/customers/orders/admins | ✅ count=0 for all four |
| 19 | `get_order_tracking` with a valid token | ✅ correct safe subset, correct boutique, derived-overdue confirmed |
| 20 | `get_order_tracking` with an invalid token | ✅ 0 rows |
| 21–22 | per-boutique order-code sequencing, no cross-tenant collision | ✅ boutique1 → `BQ-0017` (continuing at 16), boutique2 → `BQ-0002` (continuing at 1), independently — cleaned up after |
| **23 (new)** | `current_admin_self()` for a non-admin owner | ✅ returns null |
| **24 (new)** | `current_admin_self()` for an active admin | ✅ returns own row |
| **25 (new)** | `current_admin_self()` for a suspended admin | ✅ returns own row with `active:false` |
| **26 (new)** | forged/omitted `actingAdminRole` cannot achieve anything RLS/trigger wouldn't independently allow | ✅ confirmed two ways: (a) code inspection — `setBoutiqueStatus`/`setAdminActive` never send this parameter to the API body at all; (b) a raw SQL update as `support_admin` with no client parameter involved anywhere in the request was still rejected by `enforce_boutique_update_rules()` — the trigger enforces the matrix regardless of what any client claims |

Every check matches Phase 1's original results exactly, plus the three new
`current_admin_self()` cases and the forged-role check pass. No regression
found in the schema/RLS layer itself.

**`get_advisors` (security):** re-ran both `security` and `performance`
types. Findings reconciled against Phase 1's original review
(`docs/phase1-report.md` §9):
- The `SECURITY DEFINER` "publicly executable" warnings (6 functions,
  including the new `current_admin_self()`) are the same *intended* pattern
  Phase 1 already documented — these are the identity-helper RPCs
  `authenticated` users are supposed to call, plus `get_order_tracking` for
  `anon` (the entire point of the no-login tracking page). No regression.
- "Leaked password protection disabled" — still present, still a dashboard
  Auth setting, not schema-controllable. Recommended again in §7.
- **Performance advisories are informational only** (`unindexed_foreign_keys`
  on two low-cardinality FK columns, `unused_index` on 11 indexes, and
  `auth_rls_initplan` on `boutiques_select`/`boutiques_update` re-evaluating
  `auth.<fn>()` per row). None of these are new since Phase 1, none are
  security-relevant, and the unused-index findings are expected on a
  freshly-seeded dev database with no real traffic. Not fixed in this phase
  — flagged as a normal pre-launch performance pass item, not a blocker.

## 4. R2 audit

**Re-checked directly, not assumed:** `r2_buckets_list` via the Cloudflare
MCP tool → still `{"success":false,"errors":[{"code":10042,"message":"Please
enable R2 through the Cloudflare Dashboard."}]}`. Unchanged since Phase 1.
Since it's not enabled, the live test matrix (§4 of the Phase 3 brief; §4 of
this one) could not be run — there is nothing to run it against.

**Static code review, done regardless of live status:**
- `src/lib/r2.ts` — object keys are tenant-scoped and collision-safe
  (`boutiques/{boutiqueId}/logo/{randomUUID}.{ext}` and
  `boutiques/{boutiqueId}/orders/{orderId}/cloth/{randomUUID}.{ext}`);
  presigned PUT/GET URLs are 5-minute TTL; credentials are read from
  server-only env vars, never exposed to a client bundle (re-confirmed —
  see §8).
- `POST /api/uploads/presign` — authenticates via the caller's own
  RLS-scoped Supabase client (`createSupabaseRouteClient`, anon key + session,
  not service role), looks up the caller's own boutique by `owner_user_id`,
  and for a cloth photo looks up the order by id with no explicit
  boutique-id filter in the query — **this is safe, not a gap**: the lookup
  runs through the same RLS-scoped client, so `orders_select`'s policy
  already makes a cross-tenant order id invisible regardless of the missing
  explicit filter (independently confirmed by check #5 in §3 above, on the
  same policy).
- `POST /api/uploads/confirm` — marks the `files` row `uploaded` and
  re-points the parent (`boutiques.logo_file_id` /
  `orders.cloth_photo_file_id`) at it, scoped by the `files` RLS policies
  (`files_update`'s `with check` re-validates `boutique_id`). **One real,
  if minor, gap noted but not fixed in this phase:** this route trusts the
  client's claim that the browser's direct PUT to R2 already succeeded — it
  does not itself verify the object exists in the bucket (e.g. a HEAD
  request) before marking `upload_status: 'uploaded'`. A client that calls
  `confirm` without ever completing the PUT would leave the DB saying
  "uploaded" for an object that doesn't exist. This cannot be tested without
  a live bucket, and fixing it without being able to test it against real
  R2 risks introducing an unverified regression in exchange for closing an
  edge case — flagged for whoever has real R2 access to add a HEAD-check
  and a real regression test in the same pass, rather than shipped blind.

**Unblocking R2** (dashboard steps, for whoever has account access):
1. Cloudflare Dashboard → R2 → click through to enable R2 for the account (a
   one-time acceptance of R2's terms/billing; the account currently returns
   error code 10042, meaning this step has never been done).
2. Create a bucket named to match `R2_BUCKET_NAME` in the deployed env
   (`boutiqo-uploads` per `.env.example`'s default — or update the env var to
   match whatever name is actually created).
3. R2 dashboard → Manage R2 API Tokens → create a token scoped to Object
   Read & Write on that one bucket only (not account-wide). Populate
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` from it.
4. Configure CORS on the bucket (Dashboard → bucket → Settings → CORS
   Policy) allowing the deployed app's real origin (the value documented in
   `NEXT_PUBLIC_APP_URL`) for `PUT`/`GET`, headers `Content-Type` and
   whatever the presigned URL requires.
5. Run `RUN_LIVE_E2E=1 npx playwright test tests/e2e/file-upload.spec.ts`
   with real Supabase + R2 env vars set — this is the first real exercise of
   the full upload chain.

## 5–6. Frontend and integration audit

Walked every screen Phase 3 touched or flagged, plus a general pass over the
rest. The 1024px breakpoint logic in the responsive shell was not modified
by Phase 3 (it's pure CSS/layout, untouched by the auth/data rewiring) — spot
checked `tests/e2e/responsive.spec.ts` still targets it correctly (gated,
not run live — see §11).

For every backend-backed screen, the real chain is: browser action →
data-layer function (`src/lib/data/*.ts`) → either a Phase 1 API route
(Zod-validated, service-role or RLS-scoped as appropriate) or a direct
RLS-scoped Supabase client call → Postgres/R2 → response → UI update.

**What's verified and how:**
- RLS policy correctness for every table/role combination: verified directly
  against the live database via SQL-role simulation (§3) — this is real
  verification of the actual policies as they exist right now, not a read of
  the SQL and an assumption it's correct.
- The two bugs in §2 were traced by hand through the actual TypeScript
  control flow, not guessed at.
- Build/type/lint correctness: verified fresh in this session (§9/§11).

**What remains unverified, named explicitly, not rounded up:**
- The RLS policy is confirmed correct at the SQL level; **the actual
  PostgREST/HTTP path carrying the same JWT claims through
  `@supabase/supabase-js` in a real browser has not been independently
  exercised** in this sandbox. The SQL-role simulation reproduces the same
  policy evaluation Postgres would do for a real HTTP request with the same
  claims, but it is not literally the same code path (no PostgREST, no
  actual JWT verification, no real network round trip).
- Both bugs fixed in §2 are verified by static analysis (type-check, lint,
  build, and manual trace of every state transition) — **neither was
  exercised by an actual browser session**, since that requires live
  Supabase Auth over HTTP, which this sandbox cannot reach.
- Google OAuth's actual redirect round trip (§7) — code path is correct by
  inspection; whether the provider is configured to complete it is unknown
  and unknowable from this session.
- Every R2-dependent state (upload progress, uploaded/attached indicator,
  expired presigned URL, removal) is implemented and reviewed (§4) but
  literally untestable without a live bucket.
- `RUN_LIVE_E2E=1` E2E specs and `npm run test:rls` — written, gated
  correctly (confirmed: all 10 specs skip cleanly without the flag, §11),
  never executed for real in this or any prior phase.

## 7. Two product decisions for founder sign-off

These are not engineering calls — they trade off security/friction against
each other, and this session is not authorized to make that trade-off
silently.

**1. "Confirm email" (Supabase Auth setting).** Investigated via SQL: the
seed users in the live project (`owner1@boutiqo.dev`, etc.) all show
`email_confirmed_at` populated — but that's because they were created via
the admin-provisioning path with confirmation forced, which says nothing
about what happens on a real `supabase.auth.signUp()` call from
`/owner/signup`. **This setting is not queryable via SQL or any MCP tool
available in this session** — it lives in Supabase's platform config, not a
database table (`auth.identities` is empty even for the seeded users,
consistent with them never having gone through the normal signup mailer
path either way). This is genuinely undeterminable without dashboard access,
same as Phase 3 found — but the recommendation stands and is now explicit:
**disable "Confirm email" for V1.** Self-signup is meant to be low-friction,
there's no described email-deliverability requirement in the MVP scope, and
the current register→terms flow has no "check your email" interstitial to
handle the confirmation-pending state gracefully — if confirmation is left
on, a real self-signup will silently break at the terms step (no session to
authenticate `POST /api/auth/register` with). **Needs founder sign-off**
before launch, since turning it off is a real security/abuse trade-off, not
a pure engineering default.

**2. Google OAuth provider.** Still unconfirmed whether a real provider is
configured in the Supabase dashboard — no MCP tool in this session exposes
Auth provider configuration, and configuring one requires a real Google
Cloud OAuth client that only dashboard/Google Cloud Console access can
create. **This is a scoped, isolated launch blocker for Google sign-in
specifically — it does not block anything else.** Email/password signup,
login, and every other feature work independently of this. State plainly to
users/founders: "Continue with Google" will not work until this is
configured; everything else ships regardless.

## 8. Security re-audit (full, current state)

- Service-role and R2 credentials: server-only env vars, `import "server-only"`
  guards in `src/lib/r2.ts`; re-confirmed no leak into the client bundle —
  `grep -rl "SUPABASE_SERVICE_ROLE_KEY\|R2_SECRET_ACCESS_KEY\|R2_ACCESS_KEY_ID"
  .next/static` → no matches, run fresh in this session against the current
  build.
- RLS enabled and correct on every table, including everything added since
  Phase 1 (`admins`, via the new `current_admin_self()` function) — §3.
- Cross-tenant/cross-user access denied — §3 checks #4, #5, #18.
- Tracking-token path — re-verified safe: valid token returns exactly the
  documented safe subset, invalid token returns nothing, no timing or error
  distinction (§3 check #19/#20).
- `current_admin_self()` reviewed for scope correctness: `security definer`,
  `set search_path = public` (hardened, consistent with every other helper
  function since `0005`), takes no parameters, filters strictly on
  `auth.uid()` — cannot be used to read another admin's row. Grants:
  `revoke all ... from public, anon; grant execute ... to authenticated` —
  correct, matches the pattern of every other identity-helper function.
- `proxy.ts` reviewed specifically for the "removing it grants nothing RLS
  doesn't already block" property the brief asked about: it makes exactly
  one decision (`!user` → redirect to login) based only on
  `supabase.auth.getUser()`, and returns `response` (a no-op pass-through)
  in every other case. It does not check boutique/admin status, role, or
  anything RLS-relevant — those checks live in the layout guards and, more
  importantly, in RLS itself for every actual data operation. **Removing
  `proxy.ts` entirely would not grant access to anything a signed-out or
  wrong-tenant user couldn't otherwise be shown an empty/redirected shell
  for** — every real read/write still goes through RLS regardless. Confirmed
  by direct reading, not assumption.
- Upload validation enforced server-side: `presignUploadSchema` (mime type,
  size) is applied in the API route before any object key is generated,
  independent of the client-side check in `ClothPhotoUpload.tsx` — the two
  are meant to agree (§ `docs/decisions.md` "File size / mime-type limits")
  but the server one is authoritative.
- No secrets committed, current tree or history — `git log --all -p` grepped
  for real-looking key patterns in both a live and historical scan (§10).
- Admin sub-role boundaries: enforced at the trigger/RLS layer, confirmed
  independent of any client-supplied role — §3 check #26.

## 9. Code quality audit

- `tsc --noEmit` — clean, run fresh in this session, after the §2 fixes.
- `eslint .` — clean, run fresh, after the §2 fixes. Reviewed every inline
  disable in the codebase (9 total, more than the "at least two" the brief
  mentioned — Phase 2 added a couple of `@next/next/no-img-element` and
  `react-hooks/exhaustive-deps` disables on signout redirect-once pages that
  weren't mentioned by number in prior reports): every one carries a
  specific, still-accurate justification in an inline comment (a deliberate
  skeleton-during-search pattern, a genuinely async effect, an intentional
  redirect-once-on-mount). None are a lingering suppression of a real
  problem.
- `grep -rn ": any\b" src/` — zero matches. No untyped escape hatches
  introduced across any of the three build phases.
- Dead code (Phase 3's cleanup claims, re-verified): confirmed no lingering
  reference to `public/brand/`, confirmed `src/middleware.ts` does not exist
  (only `src/proxy.ts`), confirmed the dropped
  `CreateOrderInput.clothPhotoFileId` had no call sites before this phase
  removed the field entirely (§2), confirmed the one `customerOrders()` call
  site is already correctly `async`.
- Structure: the six data-layer modules, `SessionContext`, and component
  organization remain coherent — each module still owns exactly one entity's
  real-backend calls, no cross-module reach-through was introduced across
  three phases of incremental change.
- Error handling: client-facing errors go through `ApiError`'s message field
  (server-controlled, no raw exception text or stack surfaced) or the API
  routes' structured `apiError(status, code, message)` responses — no leaked
  internals observed in any route reviewed. Nothing in this codebase writes
  server-side logs today (no logging library wired up) — failed uploads,
  rejected cross-tenant attempts, and auth failures are surfaced to the
  client but not persisted anywhere for operational visibility. **Not fixed
  in this phase** (no evidence in the design/MVP scope that structured
  server-side logging was ever a stated requirement) but flagged as a real
  production-readiness gap: before real traffic, at minimum, rejected
  cross-tenant attempts and repeated auth failures should go somewhere an
  operator can see them.

## 10. Repository audit

- `.gitignore` — covers `.env`, `.env.local`, `.env.*.local`,
  `.env.development`, `.env.production`, `.env.test`, explicitly excepts
  `.env.example`. Complete.
- `.env.example` — cross-checked against every `process.env.*` reference in
  `src/`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` — all present.
  `NEXT_PUBLIC_APP_URL` is documented but not read by any app code (it's
  used to build tracking links and OAuth redirects from
  `window.location.origin` at runtime instead) — tightened its comment in
  this phase to say so explicitly, so it reads as "value to paste into
  external dashboards" rather than implying the app consumes it. No Google
  OAuth env vars exist or are needed — that configuration lives entirely in
  the Supabase dashboard, not app config.
- Git history secret scan: `git log --all --diff-filter=A --name-only |
  grep -i "\.env"` → only `.env.example` was ever added. `git log --all -p`
  grepped for real-looking `SUPABASE_SERVICE_ROLE_KEY=`/`R2_SECRET_ACCESS_KEY=`
  patterns (excluding placeholder text) → no matches. No secret was ever
  committed and later removed.
- README reflects the current real setup (Supabase, R2-once-enabled steps
  now in this report §4, Google OAuth caveat, live-test flags) — Phase 3's
  README rewrite is still accurate; this phase's R2 unblock steps (§4) and
  the two founder-decision items (§7) are new content this report adds.
- No leftover debug code or stray `console.log` found in the reviewed
  routes/components.

## 11. Build audit (run fresh, this session)

- `npx tsc --noEmit` → clean.
- `npx eslint .` → clean.
- `npx vitest run` → **43 passed, 7 skipped** (the 7 are `tests/rls/*`,
  which needs live network — this phase's §3 SQL-simulation audit is the
  substitute verification for what those tests would check over real HTTP).
- `npx playwright test` → **10 skipped, 0 run** — confirmed each spec's
  `skipUnlessLive(test)` guard fires correctly without `RUN_LIVE_E2E=1`; not
  claimed as "passing" since nothing that exercises the actual feature ran.
- `npm run build` → clean, no warnings (including no middleware-deprecation
  warning — `proxy.ts` is the only file, `src/middleware.ts` doesn't exist).

**Exact commands for a human with real network access to finish
verification:**
```
RUN_LIVE_RLS_TESTS=1 npm run test:rls
RUN_LIVE_E2E=1 npx playwright test
```
(env vars needed for each are documented in `.env.example`'s live-test
section and `tests/rls/README.md`.)

## 12. Definition of Done — Phase 4 items

- [x] Brand-logo item confirmed against the current repository, left as is (§0)
- [x] Network/R2 access status re-checked directly this session, not assumed (§0, §4)
- [x] Every MVP/design requirement walked; two real regressions found and fixed (§2)
- [x] Full RLS/business-rule SQL-simulation audit re-run, including everything added since Phase 1 (§3)
- [x] "Confirm email" investigated (undeterminable via SQL/MCP, stated plainly) and a clear recommendation made (§3, §7)
- [x] R2 status re-confirmed (still not enabled); precise unblocking instructions documented; static code review done regardless (§4)
- [x] Every screen/state walked against the current integrated app, with two fixes applied (§5)
- [x] Integration chains verified as far as this session's access allows, unverified links named explicitly (§6)
- [x] Google OAuth status stated plainly as a scoped, isolated launch item (§7)
- [x] Full security re-audit performed against current state, including everything added since Phase 1 (§8)
- [x] Code quality and dead-code audit performed, including verification of Phase 3's cleanup claims (§9)
- [x] Repository audit performed, including git history secret-scan (§10)
- [x] Build audit run fresh in this session (§11)
- [x] A single, prioritized, actionable "what a human with real network access needs to run" checklist exists (§14)

## 13. What is genuinely ready to ship vs. what genuinely is not

**Ready, verified in this session:** the full data model, RLS policy set,
and business-rule enforcement (§3 — 26 checks, all passing, against the live
database, today); static code correctness (types, lint, build); the
brand/design alignment; the two regressions this phase found are now fixed
and pass the same static verification. The security posture (§8) is sound
for everything this sandbox can reach.

**Not ready, and why, precisely:**
1. **Zero live-HTTP verification of any auth flow, any API route, or any R2
   operation has ever happened across all four phases** — every phase
   including this one hit the same sandbox network policy. This is the
   single largest gap. §14 gives the exact commands to close it.
2. **R2 is not enabled** on the linked Cloudflare account — file upload/
   download is entirely unverified beyond static code review, and one real
   gap (§4's confirm-without-verifying-the-object-exists) needs a live
   bucket to properly fix and test.
3. **Two product decisions need founder sign-off** before launch (§7):
   disabling "Confirm email" and accepting that Google sign-in won't work
   until a provider is configured.
4. **No server-side operational logging exists** (§9) — not a correctness
   bug, but a real gap before handling actual user traffic.

## 14. Prioritized, actionable unblock list — run this to finish verification

For whoever has real network access (a normal dev machine, CI runner, or any
environment without this sandbox's egress restriction):

1. **Clone the repo, `npm install`, copy `.env.example` to `.env.local`,
   fill in the real Supabase URL/anon key** (from `get_project_url` /
   `get_publishable_keys` — already retrievable via MCP even from this
   sandbox) **and the service-role key** (dashboard → Settings → API — the
   one credential no MCP tool in this session exposes).
2. `npm run test:rls` with `RUN_LIVE_RLS_TESTS=1` — reproduces every check in
   §3 over real HTTP/PostgREST instead of SQL simulation. Should pass
   identically; if it doesn't, that's the one link (§6) this phase couldn't
   independently confirm.
3. Exercise `POST /api/auth/register` and `POST /api/admin/boutiques` for
   real — the two routes no phase has ever driven over live HTTP. Use the
   seeded dev accounts or a fresh signup.
4. Manually walk the abandon-and-resume-signup scenario this phase fixed in
   §2 (bug 1) in a real browser: sign up, close the tab before finishing
   registration, come back, log in — confirm it now routes to
   `/owner/register` instead of looping.
5. Manually create a new order with a cloth photo, then check the confirm
   screen — confirm the "Cloth photo attached" indicator (§2, bug 2)
   reflects reality, and test a forced upload failure (e.g. revoke network
   mid-upload) to confirm the toast now survives navigation.
6. **Enable R2** per the exact steps in §4, then run
   `RUN_LIVE_E2E=1 npx playwright test tests/e2e/file-upload.spec.ts` for the
   first time ever. If it fails on the "confirm marks uploaded before the
   object provably exists" gap noted in §4, add the HEAD-check fix there
   with a real regression test in the same pass.
7. `RUN_LIVE_E2E=1 npx playwright test` (the full suite) — the other 8 specs,
   never run for real either.
8. Get founder sign-off on the two items in §7 (disable "Confirm email";
   accept Google sign-in as a scoped post-launch item), then apply whichever
   decision is made in the Supabase dashboard.
9. Decide on and wire minimal server-side logging (§9) for auth failures and
   rejected cross-tenant attempts before accepting real traffic.
10. Optional, non-blocking: address the `auth_rls_initplan` performance
    advisory on `boutiques_select`/`boutiques_update`
    (`(select auth.<fn>())` instead of `auth.<fn>()` in those two policies)
    and enable "leaked password protection" in Supabase Auth settings — both
    are free improvements, neither blocks launch.

## 15. Unified Definition of Done — all four phases, one authoritative record

| Area | Status |
|---|---|
| Schema, RLS, migrations (0001–0009) | ✅ Built, applied, and re-verified live in this phase |
| Auth (signup/login/logout, disabled/suspended rejection) | ✅ Implemented and traced correctly; ❌ never exercised over live HTTP (any phase) |
| Google OAuth | ✅ Code path correct; ❌ provider configuration unconfirmed — founder-scoped item, isolated to this one feature |
| "Confirm email" setting | ❌ Undeterminable from any session so far; recommendation made, needs founder sign-off |
| R2 file storage | ✅ Code reviewed and correct; ❌ never enabled on the linked account, zero live tests ever run |
| Business rules (on_hold/disabled, order codes, derived overdue) | ✅ Fully re-verified live via SQL simulation this phase |
| Admin sub-role matrix | ✅ Fully re-verified live this phase, including forged-parameter resistance |
| Brand/design alignment | ✅ Confirmed matching source of truth |
| Frontend: 25 screens, all states | ✅ Walked; two real regressions found and fixed this phase |
| Security (secrets, RLS, function scoping) | ✅ Fully re-audited this phase, current state |
| Code quality (types, lint, dead code) | ✅ Clean, verified fresh this phase |
| Repository hygiene (.env, .gitignore, git history) | ✅ Verified this phase, no secrets ever committed |
| Server-side logging | ❌ Does not exist — flagged, not built (out of stated MVP scope, but a real pre-launch gap) |
| Live E2E / RLS test execution | ❌ Never run in any phase — §14 gives the exact commands |

**Bottom line: run and verify, not "this works."** Every code-level and
database-level claim in this document was independently checked in this
session, today, against the live project or the current repository — not
carried forward from a prior phase's word. The one thing no phase, including
this one, could do is put real HTTP traffic through this application in a
network that reaches Supabase and R2. That is the actual finish line, and
§14 is the exact, complete list of what closes it.
