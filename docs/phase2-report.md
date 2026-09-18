# Phase 2 completion report — frontend UI (mock-data mode)

Status: **complete**. All 25 screens exist as real routes, styled with the
ported design system, responsive at a documented breakpoint, backed by a mock
data layer that mirrors Phase 1's real API/schema shapes. Full test suite run
and passing (results in §7). Nothing in this phase calls Supabase, R2, or
Google OAuth — that's Phase 3.

## 1. What was built

- **Design system port** (`src/styles/`, `src/components/ds/`): the actual
  token CSS files and `components.css` from
  `_ds/boutiqo-design-system-.../` copied verbatim (not re-derived), all ten
  font faces wired up in `public/fonts/` + `tokens/fonts.css`, and 16 typed
  React components (`Button`, `Card`, `Badge`, `IconButton`, `Tag`, `Input`,
  `Select`, `Checkbox`, `Radio`, `Switch`, `Tabs`, `StageBadge`, `LoadCell`,
  `Dialog`, `Toast`, `Tooltip`) ported from `design-system-source/`'s `.jsx` +
  `.d.ts` pairs — same prop contracts, same emitted `.bq-*` classes.
- **App-only components** (`src/components/app/`): `AppShell` (the
  responsive sidebar/tab-bar shell), `OrderRow`, `StatTile`, `StepperPills`,
  `MeasurementGrid` + `MeasurementGuide`, `VoiceTypeToggle`, `CalendarGrid` +
  `LoadLegend`, `StageRows`, `TrackingProgress`, `ClothPhotoUpload` +
  `RemoteImage` (the full upload/viewing state machine), `Logo`.
- **Pure business logic** (`src/lib/calc/`): `calendarLoad.ts` (3-band
  thermal scale), `order.ts` (balance, derived-overdue, stage helpers),
  `format.ts` (en-IN money, short/long date).
- **Mock data layer** (`src/lib/data/`): see §4.
- **Mock session/toast** (`src/lib/session/`): `SessionContext` (owner/admin
  login, disabled/suspended handling, the signup→register→terms draft flow)
  and `ToastContext` (single toast, 2600ms auto-dismiss, replaces not stacks).
- **25 screens** — see §2 for the full inventory against the handoff.
- **Tests** — see §7.

## 2. Screen inventory (25/25)

### Boutique owner (16)
| Handoff id | Route |
|---|---|
| owner-signup | `/owner/signup` |
| owner-register | `/owner/register` |
| owner-terms | `/owner/terms` |
| owner-login | `/owner/login` |
| owner-dashboard | `/owner/dashboard` |
| owner-customers | `/owner/customers` |
| owner-new-customer | `/owner/customers/new` |
| owner-customer | `/owner/customers/[id]` |
| owner-new-order | `/owner/orders/new` (steps A–E as in-page state, not sub-routes) |
| owner-confirm | `/owner/orders/[id]/confirm` |
| owner-order | `/owner/orders/[id]` |
| owner-stage | `/owner/orders/[id]/stage` |
| owner-calendar | `/owner/calendar` |
| owner-billing | `/owner/billing` |
| owner-settings | `/owner/settings` |
| owner-signout | `/owner/signout` |

### Super admin (8)
| Handoff id | Route |
|---|---|
| admin-login | `/admin/login` |
| admin-dashboard | `/admin/dashboard` |
| admin-boutiques | `/admin/boutiques` |
| admin-boutique | `/admin/boutiques/[id]` |
| admin-add | `/admin/boutiques/new` |
| admin-access | `/admin/boutiques/[id]/access` |
| admin-roles | `/admin/roles` |
| admin-signout | `/admin/signout` |

### Customer (1)
| Handoff id | Route |
|---|---|
| cust-track | `/track/[token]` — no chrome, no auth |

## 3. Layout / responsive breakpoint

**1024px**, implemented as a real CSS media query (`src/app/app.css`), not a
JS/manual toggle. Both `.bq-shell-mobile` and `.bq-shell-web` are always
present in the DOM; the query shows exactly one. Verified with a Playwright
test that resizes the viewport and asserts which shell is visible at 390px
vs. 1280px (§7). Every difference in the handoff's "what changes" table is
implemented at this same breakpoint — see README "Layouts and the responsive
breakpoint" for the full list and reasoning.

**Judgment call:** a real production app would probably want an intermediate
tablet treatment (768–1024px), which the design bundle doesn't specify at
all. I kept the mobile (bottom-tab, single-column) layout all the way up to
1024px rather than inventing an undocumented in-between state — it degrades
acceptably (the design system's own "fluid below 1280px" note for the web
frame suggested tolerance for viewport variation), and it's a smaller
deviation from the source material than guessing a new layout.

## 4. Mock data layer — exact shape for Phase 3

`src/lib/data/store.ts` holds all state as plain arrays typed with Phase 1's
real row types (`src/lib/supabase/types.ts` — `Boutique`, `Customer`,
`Order`, `AdminUser`, `FileRow`), so field names are guaranteed to match the
actual schema. Seeded with:
- 5 boutiques: `b1` active (rich data), `b2` **on_hold**, `b3` **disabled**,
  `b4`/`b5` active (thinner data, for admin-list variety).
- 6 customers across 3 boutiques.
- 8 orders on `b1`/`b2`/`b4` covering **all 5 real stages** plus one
  (`o6`, stage `cutting`, `due_date` in the past) whose **derived overdue**
  computation is true — verified this renders as "Overdue" without being a
  stored value anywhere.
- One order (`o1`) has a **fixed, non-random tracking token**
  (`demo0000…0001`) so the tracking page and E2E tests can link to it
  directly; every other order has a real random 64-hex-char token like the
  real schema.
- One order (`o1`) has **all 14 measurement fields** populated; others have
  none, to exercise the "no measurements recorded" path too.
- Calendar load data (`calendarLoadByDate`) spans all three thermal bands
  (values include 1, 3, 4, 5, 6, 8, 9 — hitting free/low/busy).
- 4 admins, one per role, `admin.viewer`-equivalent seeded **inactive**.

Per-resource modules (`boutiques.ts`, `customers.ts`, `orders.ts`,
`admins.ts`, `tracking.ts`, `uploads.ts`) export functions shaped exactly
like Phase 1's routes:
- `createOrder(input)` — mirrors `POST /api/orders`: generates a
  per-boutique sequential `BQ-####` code and a 64-char token, and **rejects
  when the boutique isn't `active`** (same on_hold/disabled business rule
  Phase 1's RLS enforces), throwing `MockApiError` with the same kind of
  message the real route would show.
- `updateOrderStage`, `markOrderPaid` (idempotent, no reverse action) mirror
  their routes exactly.
- `setBoutiqueStatus(id, status, actingAdminRole)` and
  `setAdminActive(id, active, actingAdminRole)` re-implement the exact admin
  sub-role matrix from Phase 1's `enforce_boutique_update_rules()` trigger
  and `admins_update` RLS policy (support_admin can hold/activate but not
  disable; billing_admin/viewer can't touch status at all; only owner_admin
  can suspend/reactivate another admin) — **tested** in
  `tests/unit/data-layer.test.ts`.
- `getOrderTracking(token)` mirrors `GET /api/track/:token` → the
  `get_order_tracking()` RPC's exact return shape, including returning `null`
  (never a distinguishing error) for an unknown token.
- `presignUpload` / `simulateUploadProgress` / `confirmUpload` /
  `getDownloadUrl` mirror the presign→PUT→confirm→download-url flow, with
  `simulateUploadProgress` driving `ClothPhotoUpload`'s determinate progress
  bar (chosen over an indeterminate spinner because the real Phase 3
  implementation — an XHR PUT to R2 — has genuinely measurable progress).

Every function is wrapped in `simulate()`, which adds ~150–260ms of latency
and can be forced to fail globally via `setForceFailure(true)` — this is what
makes the loading/error states in §6 real, exercised code paths rather than
markup that only looks right in isolation.

**What Phase 3 replaces:** the *internals* of these six modules (swap the
array reads/writes for real `fetch`/Supabase-client calls) — the exported
function signatures, parameter shapes, and return types should not need to
change, since they were written to match Phase 1's actual routes and schema
from the start.

## 5. Design system porting

Chosen approach: **direct CSS import**, not a Tailwind config remap.
`src/styles/tokens/*.css` and `src/styles/components.css` are the design
bundle's own files, imported via `src/app/globals.css`; every color, spacing,
radius, shadow and motion value used anywhere in the app resolves to one of
these CSS custom properties or a `.bq-*` class — never a hand-picked
approximate value. **Tailwind was removed entirely** (`npm uninstall
tailwindcss @tailwindcss/postcss`, `postcss.config.mjs` deleted): the design
tokens are richer and more specific than Tailwind's default scale, so a
config-extension layer would only add indirection with no benefit, and
risked two competing sources of truth for the same values.

Boutiqo's own layout patterns (the app shell, calendar, stepper, order rows,
measurement grid, etc.) live in `src/app/app.css`, built entirely on top of
the imported tokens (`var(--...)`) and, where they wrap a design-system
primitive, its `.bq-*` classes.

**Judgment call — calendar color scale:** the design system's bundled
`LoadCell` component (`src/components/ds/LoadCell.tsx`) implements a generic
5-level blush→signal density scale. `CLAUDE_CODE_HANDOFF.md`'s own "changes
made after the first implementation" section is explicit that Boutiqo's
*actual* calendar was deliberately recolored to a different, final 3-colour
thermal scale (green/amber/red) superseding that generic component for this
specific use. I built the real calendar (`CalendarGrid`/`CalendarDayCell`)
as a first-class app component using the 3-colour scale exactly as specified
(free/low/busy against capacity 8), and kept `LoadCell` around only as a
faithfully-ported design-system primitive for inventory completeness — it is
not used anywhere in the actual calendar screens. This is called out inline
in both files.

## 6. States built (Phase 2 brief §6)

Every screen has loading (skeleton), empty, and error states reachable
through the mock layer (e.g. `owner-customers`/`admin-boutiques` search
empty state, dashboard "nothing due this week", billing "no bills due").
File handling (`ClothPhotoUpload` in `src/components/app/ClothPhotoUpload.tsx`)
covers: selection, client-side type/size validation feedback, upload-in-
progress with a determinate bar, success, failure with a retry action,
preview, delete/remove. `RemoteImage` (same file) covers the *viewing* side
for a would-be presigned URL: loading, ready, missing, expired, unauthorized
— used on the tracking page (`missing` when no cloth photo is attached).
Also built: the disabled-boutique login notice (`/owner/login`), the
on-hold-blocks-new-order notice + disabled "New order" button (owner
dashboard/shell), the suspended-admin login notice (`/admin/login`), and a
generic error path via `MockApiError` messages surfaced inline wherever an
action can fail (order creation, customer creation, boutique-status
changes, admin suspend/reactivate).

## 7. Testing — actually run, results below

### Vitest (`npx vitest run`)
```
Test Files  4 passed | 1 skipped (5)
     Tests  51 passed | 7 skipped (58)
```
The 1 skipped file / 7 skipped tests are Phase 1's `tests/rls/*` (gated
behind live Supabase network access, unrelated to Phase 2). Phase 2 added:
- `tests/unit/calc.test.ts` — `loadBand`'s 3 thresholds, `balance`, derived
  `isOverdue`/`effectiveStage` (including "ready/delivered are never
  overdue" and the "overdue is never stored" property), stage-order helpers,
  `formatMoney`/`formatShortDate`.
- `tests/unit/data-layer.test.ts` — sequential per-boutique order codes,
  on_hold/disabled blocking order creation, advance-exceeds-total rejection,
  idempotent mark-paid, stage updates, forced-failure path, tracking lookup
  (valid + unknown token), and the full admin sub-role boutique-status
  matrix (support_admin hold-yes/disable-no, billing_admin/viewer blocked
  entirely, owner_admin full access).

### Playwright (`npx playwright test`, against `next build && next start`)
```
8 passed (18.6s)
```
- `owner-new-order.spec.ts` — full A→B→C→D→E→save→confirm flow, including
  picking a real calendar date and reading the delivery-summary panel.
- `customer-search.spec.ts` — live filtering (present → filtered → "no
  customers found").
- `stage-update.spec.ts` — moves a real order to "Delivered", asserts the
  exact toast copy (`"Order {code} moved to delivered."`), then re-opens the
  stage screen and asserts an earlier row has `data-done="true"` and
  computed `text-decoration-line: line-through`.
- `terms-gating.spec.ts` — full signup→register→terms flow; asserts the
  Continue button is disabled with 0 and 1 boxes checked, enabled at 2.
- `calendar-colors.spec.ts` — asserts computed `background-color` for all
  three thermal bands against the real token hex values.
- `tracking-page.spec.ts` — valid token renders the safe subset + no nav
  chrome present; invalid token renders the generic not-found message.
- `responsive.spec.ts` — resizes to 390px and 1280px and asserts which
  shell (`.bq-tabbar` vs. `.bq-sidebar`) is actually visible at each.

**A real bug was found and fixed via this testing**, worth recording the same
way Phase 1 did: `Button` with `as="a" href="..."` rendered a bare `<a>` tag.
Clicking it triggered a full browser navigation (not Next.js client-side
routing), which silently wiped the in-memory mock session on *every*
internal navigation that used this pattern (the dashboard's "New order"
button, "Update stage", "Add boutique", etc. — used throughout the app).
Fixed by having `Button` render through `next/link`'s `Link` when
`as === "a"` and an `href` is present (`src/components/ds/Button.tsx`). This
would have been invisible in casual manual clicking (a hard navigation still
lands on the right URL, just with a full-page reload) but broke every
multi-step flow that depended on the session surviving more than one
navigation — exactly what the E2E suite is for.

Also found: the design system's `LoadCell` scale doesn't match the
calendar's actual required scale (§5) — not a bug, a design-source ambiguity
resolved and documented rather than silently picked.

### `tsc --noEmit`, `eslint`, `next build`
All three run clean. One ESLint rule (`react-hooks/set-state-in-effect`, from
the React Compiler-informed ruleset) was suppressed with inline comments in 3
call sites where an intentional loading-skeleton reset or a memoized async
loader call is the deliberate behavior, not an accidental cascading render —
each is commented explaining why.

## 8. Accessibility & motion

Tap targets: `--tap-min: 44px` is applied via the ported `.bq-btn`/`.bq-input`/
`.bq-choice`/`.bq-switch`/`.bq-iconbtn` classes throughout — not re-specified
per screen. Focus rings: `:focus-visible { box-shadow: var(--focus-ring) }` is
a global rule in `tokens/base.css` (ported, not re-implemented), so every
interactive element gets the 3px signal-red ring on keyboard focus
automatically. Reduced motion: `tokens/base.css`'s
`@media (prefers-reduced-motion: reduce)` rule (also ported) collapses all
animation/transition durations to near-zero; the one Phase 2-authored
animation (`bq-skeleton-sweep`) explicitly respects the same media query.

## 9. Judgment calls (design-source ambiguities)

1. **Calendar color scale** — see §5. Used the handoff's explicit 3-colour
   final spec, not the design system's generic `LoadCell` component.
2. **Tablet breakpoint** — see §3. No intermediate treatment specified;
   extended the mobile layout up to 1024px rather than inventing one.
3. **New-order customer selection** — the handoff doesn't say which of the
   5 lettered steps (A–E: Measurements/Cloth photo/Work details/Delivery
   date/Billing) picks the customer. Placed it in step C ("Work details")
   alongside garment type/tailor/cloth, since that's where the order's
   *identity* (who and what) is otherwise established, and no step is
   explicitly a customer-picker.
4. **"New order" prefill** — the handoff says new orders prefill "step A
   with the last order's figures." Implemented as: the boutique's
   most-recently-created order's measurement values and total/advance
   amounts, since those are the only "figures" step A/E plausibly cover
   (garment-specific fields like garment type were left blank as
   order-specific, not boutique-habit data).
5. **Brand logo** — see README "Brand logo" and §"What to produce" below;
   user-directed override of the handoff's own no-raster-lockup guidance,
   using a different image than the one the handoff warned against.

## 10. Checklist (Phase 2 brief §11)

- [x] All 25 screens exist as real routes, matching fields/actions/copy.
- [x] Both layouts are genuine responsive behavior at a documented (1024px)
      breakpoint, reproducing every "what changes" difference.
- [x] Every design token sourced from the actual `_ds/.../tokens/*.css`
      files (direct import, not approximated).
- [x] Every design-system component matches its `.d.ts` prop contract;
      every prototype-only component is a first-class app component.
- [x] Icons are `lucide-react@0.454.0` using the exact glyph names listed.
- [x] All ten font faces wired up per the Svetze/Aptos/Aptos-Mono rules;
      Svetze licensing flagged as a pre-launch blocker (README + here).
- [x] Every §6 state built and reachable through the mock data layer,
      including file-upload states and disabled-login/on-hold/suspended-
      admin states.
- [x] Mock data layer is the only path screens use, mirrors Phase 1's real
      shapes, seeded to exercise every stage/status/thermal band.
- [x] No screen makes a real network call to Supabase, R2, or Google OAuth.
- [x] Copy rules enforced (voice, sentence case, fixed vocabulary, stage
      names — "Received/Cutting/Stitching/Ready/Delivered/Overdue" only).
- [x] Accessibility requirements met (tap targets, focus rings, reduced
      motion) — see §8.
- [x] Vitest and Playwright suites actually run, failures fixed, re-run
      clean — see §7 for real output.
- [x] `tsc --noEmit`, lint, and `next build` all pass cleanly.
- [x] README and this report updated.

## 11. Context for Phase 3

Phase 3's job: wire this UI to the real Phase 1 backend and R2, replacing
the mock data layer's internals only.

- **Where to start:** `src/lib/data/*.ts` — replace each function's body
  (currently reading/writing `store.ts` arrays) with real Supabase-client
  calls / `fetch`s to the Phase 1 API routes listed in
  `docs/phase1-report.md`. Signatures should not need to change.
- **Auth:** replace `src/lib/session/SessionContext.tsx`'s mock
  `loginOwner`/`loginAdmin` with real Supabase Auth (`signInWithPassword`,
  session listeners) and wire up the Google OAuth button in
  `owner/(auth)/signup` (currently a placeholder that shows an inline
  message instead of redirecting).
- **File uploads:** `src/components/app/ClothPhotoUpload.tsx` already
  implements the full presign→PUT→confirm state machine against the mock
  `uploads.ts` — Phase 3 replaces `uploads.ts`'s internals with real
  presigned R2 URLs from `POST /api/uploads/presign` and an actual
  `fetch(url, {method:'PUT', body: file})`, keeping the same progress-
  callback shape (`simulateUploadProgress`'s signature) if practical, or
  swapping to XHR's native `upload.onprogress` for real determinate
  progress.
- **Tracking page:** `src/app/track/[token]/page.tsx` calls
  `getOrderTracking` — Phase 3 points this at `GET /api/track/:token`
  instead of the mock lookup; the `TrackingView` shape already matches that
  route's real response.
- **Known Phase 1 items relevant here:** R2 was not enabled on the
  Cloudflare account during Phase 1 development (see
  `docs/phase1-report.md`) — this must be done (a manual dashboard step)
  before Phase 3 can test real uploads. The Supabase service-role key was
  also not available in that session for `/api/auth/register` and
  `/api/admin/boutiques` — those two routes are implemented but were never
  exercised over live HTTP; test them early in Phase 3.
- **Do not** re-derive the business rules already encoded in both the mock
  layer and Phase 1's RLS/triggers (on_hold/disabled effects, per-boutique
  order numbering, admin sub-role matrix, overdue-is-derived) — they're
  documented once in `docs/decisions.md` and should be treated as settled.
