# Phase 3 completion report — frontend + Supabase + R2 integration

Phase 3's job was to replace Phase 2's in-memory mock data layer with real
calls to Phase 1's backend (Supabase Postgres/Auth/RLS, R2 file storage, the
Next.js API routes), without redesigning the schema, RLS, or the 25 screens
except where a genuine bug or mismatch was found. This report says plainly
what was wired and verified, what was wired but **not** verified over live
HTTP (and why), and what to do next.

**Read this in "run and verify" mode, not "this works" mode.** Everything
below that says "implemented" or "reasoned through" but not "verified against
live HTTP" needs exactly that — a real run — before anyone treats it as
proven.

## 0. The Logo/brand-mark question (§0 of the Phase 3 brief)

The brief's §0 asked me to check what `Logo`/the app header actually renders
today, and — if it's the raster lockup image — treat that as an unauthorized
deviation unless there's a corroborating record, not to just trust a prior
phase's self-reported "the user asked for this."

**What I found:** Phase 2's `Logo.tsx` did render a raster PNG
(`public/brand/logo.png`) via `next/image`, overriding the design handoff's
own instruction not to use the raster lockup.

**What I know first-hand, stated honestly:** that override *was* a real,
direct request from the user, made mid-conversation in this same session
during Phase 2 — not a fabricated claim inserted into a report. I have direct
knowledge of this, not just the report's word for it. I'm stating this
plainly because the brief specifically warned against silently trusting an
uncorroborated claim, and I don't want my compliance with §0 to be read as
agreement that the claim was false — it wasn't.

**What I did anyway:** reverted it, per this phase's explicit instruction,
since the brief's standing instruction for *this* phase is to prefer the
project's actual source-of-truth docs (the design handoff) over an
in-session request that left no trace in those docs. `Logo.tsx` now renders
only the small signal-red dot the design system's tokens define, ignoring
its `size`/`onDark` props (kept for call-site compatibility). `public/brand/`
was deleted entirely. If the user wants the raster mark back, that's a
one-line revert of this component — flagging it here so Phase 4 doesn't
re-litigate it from scratch.

## 1. Pre-flight (§3) — what was satisfied vs. blocked

| Item | Status |
|---|---|
| Logo/header raster-image check | Done — see §0 above |
| Confirm Supabase project reachable | **Blocked** — outbound HTTPS to `*.supabase.co` is rejected by this sandbox's egress policy (`curl` → `403`, proxy status shows `connect_rejected`/"policy denial or upstream failure"). Identical to the constraint Phase 1 hit and documented. Not routed around, per environment policy. |
| Confirm R2 bucket enabled | **Blocked** — `r2_buckets_list` via the Cloudflare MCP tool still returns `{"success":false, errors:[{"code":10042,"message":"Please enable R2 through the Cloudflare Dashboard."}]}`. Same as Phase 1; unchanged in Phase 3. |
| Service-role key available for admin-flow testing | **Blocked** — no MCP tool in this session exposes `SUPABASE_SERVICE_ROLE_KEY` (only `get_publishable_keys`, which returns anon/publishable keys). `POST /api/auth/register` and `POST /api/admin/boutiques` could not be exercised over live HTTP. |

Given all three, live-HTTP verification of the full stack was not possible in
this sandbox. What *was* available and used throughout: the Supabase MCP
`execute_sql`/`apply_migration` tools, which run through a separate channel
that isn't blocked by the egress policy, giving direct (if not HTTP-level)
access to the real database for verification.

## 2. Data layer rewire (§4)

All six `src/lib/data/*.ts` modules (`boutiques`, `customers`, `orders`,
`admins`, `tracking`, `uploads`) now call the real Supabase client or Phase 1
API routes instead of in-memory arrays. Exported signatures were kept
unchanged **except** these documented cases:

- **`registerBoutique`** now takes a `terms: {tnc, privacy}` field and makes
  one combined call to `POST /api/auth/register`, because that's what the
  real route actually expects in a single request body — Phase 2's UI had
  register and terms as two separate screens making two separate mock calls.
  Fixed by buffering the registration fields in `SessionContext`'s
  `draftSignup.fields` across the register screen, and firing the real API
  call only from the terms screen once both boxes are checked.
- **`customerOrders`** changed from sync to `async` — the real data source is
  a network call, not an array filter. The one call site
  (`customers/[id]/page.tsx`) was updated to await it.
- **`CreateOrderInput.clothPhotoFileId`** was dropped — the real
  order-creation route has no such field, and the real upload flow requires
  an order id that doesn't exist until after creation (see §3 below).
- **`setBoutiqueStatus`/`setAdminActive`** keep their `actingAdminRole`
  parameter for call-site compatibility, but it's now inert — the real RLS
  policies and the `enforce_boutique_update_rules()` trigger enforce role
  restrictions server-side, so client-side gating is redundant defense, not
  the source of truth.

`uploadFileWithProgress()` now uses a real `XMLHttpRequest` with
`upload.onprogress` for real progress events, replacing Phase 2's simulated
progress timer.

## 3. Cloth-photo-in-wizard mismatch (§ noted in brief)

Phase 1's presign route validates that the target order exists and belongs
to the caller's boutique (`presignUploadSchema` requires a real
`orderId: uuid`). Phase 2's new-order wizard captured the cloth photo in step
B, before the order exists, using a placeholder id — which would fail real
validation outright.

**Fix:** `ClothPhotoUpload` now supports `orderId: string | null`. With
`null` (the new-order wizard, pre-creation), it only selects/validates/
previews the file client-side and hands it back via `onFileSelected(file)` —
no network call yet. Once `createOrder` succeeds, `orders/new/page.tsx` calls
a new `uploadDeferredClothPhoto(boutiqueId, orderId, file)` helper to do the
real upload against the now-real order id. A failed deferred upload doesn't
block the order save (the order is already created; the user can retry the
photo from the order page).

## 4. Auth (§5)

`SessionContext` was rewritten around real Supabase Auth:

- `signUpOwner` → `supabase.auth.signUp()` directly, session buffered as
  `draftSignup` (email + userId + registration fields) until terms
  acceptance completes registration.
- `loginOwner` → `POST /api/auth/login`, which does the disabled-boutique
  check server-side and signs a disabled owner back out immediately if their
  boutique is disabled (this was already Phase 1 behavior; Phase 3 just wires
  the UI to it for real).
- `loginAdmin` → `supabase.auth.signInWithPassword()` then
  `current_admin_self()` RPC to check suspension client-side before treating
  the session as a valid admin session.
- `signInWithGoogle` → `supabase.auth.signInWithOAuth({provider: "google",
  options: {redirectTo: ...}})`.
- Session resolution (`resolveSession()`) checks `current_admin_self()`
  first (the narrower group), then falls back to a `boutiques` lookup by
  `owner_user_id`.
- Session state now has three values, not two: `undefined` (still checking,
  on initial load/reload) vs `null` (confirmed signed out) vs a real session.
  Both `owner/(app)/layout.tsx` and `admin/(app)/layout.tsx` were updated to
  wait for `undefined` to resolve before redirecting to login — without this,
  a page reload would flash a login redirect before the async session check
  had a chance to complete.

**Google OAuth: provider not configured.** The code path is wired correctly
(`signInWithOAuth` with a same-origin `redirectTo`), but I have no way to
confirm a Google provider is actually configured in this Supabase project's
Auth settings — the MCP tools available don't expose Auth provider
configuration, and even if they did, this needs a real Google Cloud OAuth
client (client ID/secret) that only a human with dashboard access can create.
**This is a human step, not a code gap:** whoever sets this project up for
real needs to configure the Google provider in Supabase Dashboard → Auth →
Providers with real OAuth credentials.

**Email confirmation:** if the Supabase project's "Confirm email" setting is
on (default for new projects), `supabase.auth.signUp()` won't return a usable
session until the user clicks a confirmation link, which means
`POST /api/auth/register` (which needs an authenticated caller) can't
complete right after signup. For a smooth self-signup flow as designed, this
setting should be turned off, or the register/terms flow needs a "check your
email" interstitial — Phase 3 didn't add one, since I couldn't test against
a real project to know which is actually needed. Documented in
`tests/e2e/terms-gating.spec.ts` and README.

## 5. Real bug found and fixed: suspended admins couldn't see their own status

See `docs/decisions.md` §6 for the full writeup. Short version: the
`admins_select` RLS policy's `is_admin()` check filters on `active = true`,
which also hides a suspended admin's *own* row from themselves — so there
was no reliable way for the client to tell "you're a suspended admin" apart
from "you were never an admin." Verified directly against the live database:

```sql
-- as the suspended user (SET LOCAL ROLE authenticated + JWT claim simulation):
select count(*) as visible_via_plain_select from public.admins;
-- => 0

select * from current_admin_self();
-- => { id: ..., active: false, ... }   -- after the fix
```

Fixed with migration `0009_admin_self_lookup.sql`, adding a
`security definer` `current_admin_self()` function scoped to the caller's own
row only, applied via `apply_migration` against the live project.
`SessionContext.loginAdmin`/`resolveSession` call it instead of a plain table
read.

## 6. Route protection

`src/middleware.ts` was renamed to `src/proxy.ts` (Next.js 16 deprecated the
`middleware` convention in favor of `proxy`; migrated via
`npx @next/codemod@canary middleware-to-proxy .`). It refreshes the Supabase
session cookie on each request and coarsely redirects unauthenticated
requests to `/owner/*` or `/admin/*` to the appropriate login page. This is a
coarse, cookie-presence-based check — the real authorization boundary is
still RLS at the database layer, as it was in Phase 1; the proxy is a UX
convenience (don't show a protected page and then redirect), not the
security boundary.

## 7. R2 / file storage (§6)

**Still blocked.** R2 is not enabled on the linked Cloudflare account
(confirmed again this phase via `r2_buckets_list`). All upload/download code
paths are implemented against Phase 1's presign+confirm API shape and were
reasoned through carefully, but none of it has been exercised against a real
bucket. `tests/e2e/file-upload.spec.ts` is written and gated behind
`RUN_LIVE_E2E`, ready to run the moment R2 is enabled and a dev environment
has real network access.

## 8. Data-refresh strategy

No client-side cache layer was added. Every data-layer function does a plain
fetch/RPC call each time it's invoked; screens re-fetch after a mutation
succeeds (e.g. creating an order re-fetches the order list) rather than
optimistically patching local state. This was a deliberate choice for Phase
3: optimistic updates or a cache (SWR/React Query) would be real value for a
production app, but introduce a second source of truth to keep in sync with
RLS-gated server state, and nothing in the brief asked for it. Backlog item
for Phase 4 if perceived latency becomes an issue.

## 9. Tests (§8)

- **Unit tests** (`npx vitest run`): 43 passed, 7 skipped. The 7 skipped are
  Phase 1's `tests/rls/*` suite, which needs live network access to run (same
  as before). `tests/unit/data-layer.test.ts` was rewritten — the Phase 2
  mock-array logic it tested no longer exists; it now covers
  `computeLoadByDate` (the pure calendar-load helper) and the `ApiError`
  class, with a comment explaining why the rest was retired rather than
  ported.
- **E2E tests** (`npx playwright test`): all 10 specs skip cleanly without
  `RUN_LIVE_E2E=1` (verified: "10 skipped", no crashes). Every spec now
  starts with `skipUnlessLive(test)` and real specs use real env-provided
  credentials (`TEST_OWNER_EMAIL`/`TEST_OWNER_PASSWORD`/etc. — see
  `.env.example`) instead of Phase 2's fixture-fill buttons, which no longer
  exist against a real backend. `tests/e2e/file-upload.spec.ts` is new,
  additionally blocked on R2 (§7).
- **Real live runs** (`RUN_LIVE_E2E=1 npx playwright test`,
  `npm run test:rls`) were **not** executed in this session — blocked by the
  same egress policy as everything else network-bound. They're ready to run
  on a machine with real access; that's the actual verification step Phase 3
  couldn't complete itself.

## 10. Static verification

- `tsc --noEmit` — clean.
- `eslint .` — clean (one legitimate inline disable added in
  `SessionContext.tsx` for `react-hooks/set-state-in-effect`, on a genuinely
  async effect, with an explanatory comment).
- `npm run build` — clean; no more "middleware deprecated" warning after the
  proxy.ts rename.

## 11. Security review (re-run over what's actually reachable)

- `grep -rl "SUPABASE_SERVICE_ROLE_KEY\|R2_SECRET_ACCESS_KEY\|R2_ACCESS_KEY_ID" .next/static` → no matches. No server-only secret leaks into the client bundle.
- All data-layer calls that touch tenant data go through either RLS-gated
  Supabase client calls (subject to the same policies Phase 1's `tests/rls`
  suite already validated) or Phase 1's existing API routes (already
  Zod-validated) — Phase 3 didn't introduce any new server-side endpoints
  that would need fresh review.
- The one new piece of server-side logic, `current_admin_self()`, is
  intentionally narrow: `security definer` but scoped to `auth.uid()` with no
  parameters, so it can only ever return the caller's own row — it cannot be
  used to read another admin's data.
- Could not re-run Phase 1's live security checks (RLS cross-tenant probes
  over real HTTP) for the same network reasons as everything else in this
  report; the SQL-role-simulation technique substituted for the admin
  self-lookup bug specifically, not for a full re-audit.

## 12. Definition of done (§11) — checklist

- [x] Logo/header checked against source-of-truth docs; raster override
      reverted per this phase's explicit instruction (§0 above)
- [x] All six data-layer modules rewired to real backend, signatures
      preserved except three documented, necessary changes
- [x] Real Supabase Auth wired: signup, login, logout, session persistence,
      disabled-boutique rejection, suspended-admin rejection
- [ ] Auth flows verified over live HTTP — **blocked**, sandbox egress policy
- [x] Google OAuth redirect wired correctly
- [ ] Google OAuth provider confirmed configured — **blocked**, needs human
      dashboard access + real OAuth credentials
- [x] R2 upload/download code wired against Phase 1's presign+confirm shape
- [ ] R2 exercised against a real bucket — **blocked**, R2 not enabled
- [x] Business rules (on_hold, disabled, sequential order codes, derived
      overdue) — code-level wiring confirmed unchanged from Phase 1's already
      -verified implementation; one real gap found and fixed (§5)
- [ ] Business rules re-verified over live HTTP in Phase 3 specifically —
      **blocked**, same network constraint
- [x] Real integration/E2E test scaffolding added, gated behind
      `RUN_LIVE_E2E`; all specs skip cleanly without it
- [ ] Live test run actually executed — **blocked**; ready for a machine with
      real network access
- [x] `tsc`/`eslint`/`npm run build` all pass
- [x] Security review re-confirmed for what's reachable in this sandbox
- [x] README updated with real setup instructions (Supabase email
      confirmation + Google provider setup steps, live-test env vars, updated
      architecture/data-layer/brand sections)
- [x] `docs/decisions.md` amended with the admin-self-lookup finding
- [x] This report

**Bottom line:** every piece of Phase 3's integration work is implemented
and reasoned through carefully, one real bug was found and fixed against the
live database, but the network-bound verification a normal environment would
give you for free — live auth flows, live R2 uploads, live E2E runs — could
not happen in this sandbox. Someone with real network access needs to run
`RUN_LIVE_E2E=1 npx playwright test` and `npm run test:rls` before treating
this as shipped.

## 13. Phase 4 handoff

Known open items for whoever picks this up next:

1. Run the live test suites for real (§9/§12) — this is the single most
   valuable next step; almost everything else in this report is downstream
   of not being able to do this.
2. Configure the Google OAuth provider in Supabase Dashboard (§4).
3. Enable R2 on the Cloudflare account, configure CORS for the app's origin,
   then run `tests/e2e/file-upload.spec.ts` for the first time (§7).
4. Decide the "Confirm email" setting for Supabase Auth, and if left on, add
   a "check your email" interstitial to the register/terms flow (§4).
5. Revisit the data-refresh strategy (§8) if perceived latency on
   mutation-heavy screens (order creation, stage updates) becomes a problem
   — a cache layer was deliberately not added in Phase 3.
6. The brand-logo question (§0) is a one-line revert if the raster mark is
   wanted back — flagged, not re-decided, by this phase.
