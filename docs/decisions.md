# Phase 1 design decisions

Boutiqo's design/MVP source material left several things ambiguous. This file
records the default resolutions Phase 1 implemented, so Phase 2/3/4 don't have
to re-derive them. Each is enforced in the schema/RLS, not just assumed.

## 1. Is "overdue" a stored stage or derived?

**Derived.** `orders.stage` only ever holds one of the 5 real stages
(`received`, `cutting`, `stitching`, `ready`, `delivered`) — see the CHECK
constraint on `orders.stage` in `0001_extensions_and_tables.sql`. "Overdue" is
computed at read time from `(stage, due_date)`:

```sql
case when stage not in ('ready','delivered') and due_date < current_date
     then 'overdue' else stage end
```

This exact expression lives in `get_order_tracking()` (`0004_tracking_rpc.sql`);
Phase 2's dashboard/list views should compute it the same way rather than
storing it, so it can never drift out of sync with `due_date`.

**Why:** "is this late" is a pure function of two other columns. Storing it as
a third fact risks it silently going stale (an order updated to `ready` a day
after its due date would otherwise still read "overdue" until something
remembers to clear the flag).

## 2. Is the `BQ-####` sequence global or per-boutique?

**Per-boutique.** `boutiques.order_seq` is a counter on each tenant's own row;
`generate_order_code()` (`0002_files_and_triggers.sql`) increments it with a
plain `UPDATE ... RETURNING`, which takes a row lock on that boutique only —
concurrent order creation for boutique A never blocks or interacts with
boutique B. Verified during Phase 1 testing: two tenants both start at
`BQ-0001` independently (see `docs/phase1-report.md`).

**Why:** avoids leaking one tenant's platform-wide order volume to another,
and is the more natural fit for a multi-tenant product.

## 3. What does each boutique status actually do?

| Status | Login | View existing customers/orders | Create customers | Create new orders | Update existing orders |
|---|---|---|---|---|---|
| `active` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `on_hold` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `disabled` | ❌ (see note) | ❌ | ❌ | ❌ | ❌ |

Enforced in `0003_rls_policies.sql`'s `customers_*`/`orders_*`/`files_*`
policies (`current_boutique_status()` gates every one). `on_hold` blocks only
*new orders* — everything else about a tenant's day-to-day use keeps working,
which matches the "hold" language on the admin console (a soft pause on
growth, not a lockout). `disabled` blocks everything.

**Login note:** `/api/auth/login` (`src/app/api/auth/login/route.ts`) signs a
disabled owner back out immediately after `signInWithPassword` succeeds — this
covers every login that goes through the app. A true JWT-mint-time block
(rejecting before a session token is even issued) needs a Supabase "Custom
Access Token" Auth Hook wired up from the project dashboard, which is a
one-time manual step outside what migrations can do — see README → Known
limitations.

## 4. Owner self-signup vs. admin-add: one table, two paths

**Both are real, independent paths into `boutiques`.** Neither RLS policy nor
the schema privileges one over the other:

- Owner self-signup: `POST /api/auth/register`, using the service-role key
  (owners have no INSERT policy on `boutiques` at all — see
  `0003_rls_policies.sql`'s comment). Requires an existing `auth.users` row
  (i.e. signup already happened) and validates terms acceptance server-side.
- Admin-add: `POST /api/admin/boutiques`, also service-role, additionally
  creates the owner's `auth.users` row via `auth.admin.createUser()` — a
  Super Admin is provisioning the tenant on the owner's behalf.

**Why:** nothing in the design or MVP scope hints at self-signup being merely
a "pending request" an admin later approves — `owner-register` reads as
immediate, self-service account creation.

## 5. Does the `billing_admin` role have anything to actually protect?

**Not yet, and that's expected for Phase 1.** The role exists and is
enforced (`enforce_boutique_update_rules()` blocks billing_admin from any
boutique status change; RLS treats it like any other non-owner_admin for the
`admins` table), but no screen among the 25 in the design implements
platform-level billing of *tenants* — `owner-billing` is a boutique's own
per-order billing to *its own customer*, a completely different concern
already covered by `orders.total_amount`/`advance_amount`/`paid`. Phase 1
does not invent platform-billing tables/screens to give this role something
to guard; that's explicit backlog for whenever Boutiqo actually bills tenants.

## Measurement storage: structured columns vs. jsonb

**Structured columns** — 14 named, nullable `numeric(4,1)` columns on
`orders` (`m01_blouse_back_length` … `m14_front_length`), each with its own
range CHECK constraint. Chosen over a single `measurements jsonb` column
because:

- The field set is finalized in the design bundle (explicitly called out as
  superseding an earlier, shorter measurement set) — this isn't a
  work-in-progress shape likely to keep changing.
- Named columns get per-field type and range validation for free at the
  database level, not just in application code.
- Future reporting/analytics ("average bust measurement this month") is a
  plain `SELECT`, not a jsonb path expression.

The tradeoff (jsonb would make a *future* field-set change schema-free) was
judged less valuable than the above, given the source material treats the
14-field list as final.

## 6. A suspended admin can't see their own row via plain `SELECT` — added `current_admin_self()`

**Found in Phase 3**, while wiring real session resolution. `admins_select`'s
`is_admin()` check requires `active = true`, which is correct for "can this
admin see *other* admins" but also hides a suspended admin's own row from
themselves — so the client has no reliable way to detect "you are logged in
but suspended" versus "you were never an admin at all" via ordinary RLS-gated
reads. Verified directly against the live project (`execute_sql`, run as the
suspended user): a plain `select * from admins` returned 0 rows for their own
`user_id`, while `select * from admins where user_id = auth.uid()` also
returned 0 — the row is invisible, not just filtered elsewhere.

**Fix:** `0009_admin_self_lookup.sql` adds `current_admin_self()`, a
`security definer` function returning only the caller's own row (via
`auth.uid()`, no parameters) regardless of `active`. It does not weaken RLS —
it's narrower than the table itself, and only exposes a caller's own record —
but it does mean "am I suspended" now goes through an RPC instead of a table
read. `SessionContext` calls it first when resolving who's logged in. See
`docs/phase3-report.md` for the before/after verification output.

## File size / mime-type limits

Not specified anywhere in the source material. Documented default: **10MB**
per file, `image/jpeg`, `image/png`, `image/webp`, `image/heic` only (a phone
camera photo comfortably fits; HEIC is included since it's the default format
on iPhones). Enforced in three independent places so a change to one doesn't
silently desync the others: the `files` table CHECK constraints
(`0002_files_and_triggers.sql`), `src/lib/r2.ts`'s exported
`ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE_BYTES`, and the Zod schema in
`src/lib/validation/file.ts` that imports those same constants.
