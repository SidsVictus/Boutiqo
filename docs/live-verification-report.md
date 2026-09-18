# Live verification — status

This document is the record for the "run live verification against real
Supabase/R2" task. **It is not the live-verification report itself** —
§§2–6 of that task (live RLS/HTTP tests, exercising the auth routes for
real, enabling and testing R2, the full live Playwright suite, testing the
OAuth redirect) could not be attempted, for a reason this document proves
rather than assumes. This records what *was* done in this session (§7's
logging, a re-confirmation of the network block) and hands off exactly what
remains to whoever runs this from a network that can reach the internet.

## 0. Network check — done first, as instructed

Before touching anything else, this session tested outbound reachability
directly rather than assuming the prior sandbox's constraint still applied:

```
curl https://qdjcyndazcbtflkgxjlt.supabase.co/auth/v1/health
  → curl: (56) CONNECT tunnel failed, response 403

curl https://api.cloudflare.com/client/v4/user/tokens/verify
  → curl: (56) CONNECT tunnel failed, response 403

curl https://www.google.com
  → CONNECT tunnel failed, 403 (connect_rejected)

curl https://cloudflarestorage.com
  → CONNECT tunnel failed, 403 (connect_rejected)
```

The proxy's own status endpoint confirms this is a default-deny egress
policy with a small allowlist (package registries and Anthropic's own API
endpoints), not a Supabase/Cloudflare-specific block:

```
"noProxy": "...,api.anthropic.com,...,registry.npmjs.org,jsr.io,pypi.org,
             files.pythonhosted.org,index.crates.io,proxy.golang.org,..."
```

**This session's environment cannot reach the general internet at all**,
which is a stricter condition than "Supabase and R2 specifically are
blocked" — there is no host-specific workaround available. Per the
environment's own instructions ("do not retry or route around it — report
the blocked host"), this session stopped rather than fabricate or simulate
results for §§2–6.

**This is new information worth acting on**: whoever runs the remainder of
this task needs an environment that is not just "not this specific
sandbox" but genuinely has outbound internet access — confirm with the same
`curl` commands above before assuming a different environment is sufficient.

## 1–6. Not run — blocked by §0

Every item in §§1 (env setup needing the service-role key), 2 (live RLS via
PostgREST), 3 (live auth routes), 4 (enable/test R2), 5 (full live E2E
suite), and 6 (founder decisions — the *dashboard changes* specifically,
though the decisions themselves can be made independent of network access,
see below) requires either real HTTP to Supabase/R2 or dashboard access this
session doesn't have a browser for. None of it was attempted here.

**§6 partial exception:** the two founder decisions ("Confirm email" setting,
Google OAuth provider) don't strictly require this session to have network
access — they require a founder's yes/no and, separately, someone with
Supabase dashboard access to apply it. Nothing changed here because no such
decision was communicated to this session; Phase 4's recommendation
(disable "Confirm email" for V1) still stands as the recommendation, unacted
on, and Google OAuth's configuration status is still unconfirmed.

## 7. Minimal operational logging — done, network-independent

This required no network access and is complete. Added `src/lib/log.ts`: a
single `logSecurityEvent(kind, details)` helper that writes one
structured-JSON line via `console.error` — deliberately not a logging
library, since most deployment targets (Vercel, any container platform)
already capture stdout/stderr into their own log aggregation with zero
further wiring. If a real log sink is added later, only this one function's
body needs to change; call sites don't.

Wired into every API route with a genuine auth-failure, cross-tenant/
authorization-rejection, or upload-failure path:

| Route | Event(s) logged |
|---|---|
| `POST /api/auth/login` | `login_failed` (bad credentials), `account_disabled_login_blocked` |
| `POST /api/admin/boutiques` | `authorization_rejected` (not an admin; viewer/billing_admin role not permitted) |
| `POST /api/admin/boutiques/[id]/status` | `authorization_rejected` (RLS/trigger rejected the status change — includes the attempted status and the DB's own rejection reason) |
| `POST /api/admin/admins/[id]/active` | `authorization_rejected` (non-owner_admin tried to suspend/reactivate) |
| `POST /api/orders/[id]/stage` | `authorization_rejected` (cross-tenant or otherwise-rejected stage update) |
| `POST /api/orders/[id]/mark-paid` | `authorization_rejected` (cross-tenant or otherwise-rejected mark-paid) |
| `POST /api/uploads/presign` | `authorization_rejected` (order not found/not owned — the cross-tenant probe case); `upload_failed` (files-row insert rejected) |
| `POST /api/uploads/confirm` | `upload_failed` (record not found; logo/cloth-photo attach rejected) |

**Deliberately not touched**, to avoid over-building past what was asked:
- Admin login's suspended-admin rejection happens client-side today
  (`SessionContext.loginAdmin` calls `supabase.auth.signInWithPassword`
  directly from the browser, not through a server route) — there is no
  server-side hook point for it without adding a new route solely for
  logging, which would be new infrastructure beyond "wire up at least a
  basic structured log." Noted here rather than silently skipped.
- Plain validation errors (400s) and not-founds that aren't
  security-relevant (e.g. "no boutique registered for this account" on a
  legitimately boutique-less new signup) are not logged — they're normal
  application flow, not failures an operator needs to see.

**Verification:** `tsc --noEmit` and `eslint .` both clean after every
change. **Not exercised against real traffic** — that requires the network
access §0 established this session doesn't have; the log lines' shape and
placement were verified by reading the code paths, not by triggering them
live.

## What's still needed

Run this task's §§1–6 verbatim from an environment that passes the §0 curl
checks above. `docs/phase4-report.md` §14 has the exact commands. This
document plus that one are what a real-network session needs to pick this
up with zero re-investigation.
