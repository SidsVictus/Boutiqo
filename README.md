# Boutiqo

Phone-first order book for small boutiques and tailors. A multi-tenant SaaS
with three audiences:

- **Boutique owners** — customers and measurements, orders across stages, a
  colour-coded calendar, billing.
- **Super admins** — a console for onboarding boutiques and managing who can
  do what.
- **Their customers** — a no-login tracking page (`/track/<token>`) shared
  over WhatsApp, showing where an order is.

**Production:** https://boutiqoo.netlify.app · **Repository:** https://github.com/SidsVictus/Boutiqo

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** — UI and API routes.
- **Supabase** — Postgres, Auth, Row Level Security. No Prisma, no GraphQL,
  no custom Express layer: the Supabase client (or the route handlers) talks
  to Postgres directly.
- **Cloudflare R2** — every binary file (cloth photos, boutique logos) via
  presigned URLs. Never Supabase Storage. An order can have any number of
  photos and there is no size limit; see "Photo storage (R2 CORS)" below.
- **Zod** — validation enforced server-side at every API boundary.
- **Design system** — the design handoff's CSS imported verbatim
  (`src/styles/`, `.bq-*` classes, tokens). Tailwind was removed; React
  wrappers for the handoff components live in `src/components/ds/`,
  product-specific pieces in `src/components/app/`.
- **Vitest** (unit/integration), **Playwright** (browser E2E).

### Fonts

Playfair Display (display), Inter (text) and JetBrains Mono (numerals), loaded
with `next/font/google` in `src/app/layout.tsx` and exposed through
`--font-display`, `--font-sans` and `--font-mono` in
`src/styles/tokens/typography.css`. No font files are stored in the repo.

### Photo storage (R2 CORS)

The browser uploads each photo straight to R2 with a presigned `PUT`, so the
bucket must allow the app's origin or every upload fails (the file row stays
`pending`). In the Cloudflare dashboard open **R2 → your bucket → Settings →
CORS policy → Add CORS policy** and paste:

```json
[
  {
    "AllowedOrigins": ["https://boutiqoo.netlify.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add any other origin the app is served from (a Netlify deploy preview, a custom
domain). The Android app loads the same site, so it needs no separate entry.

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

## Documentation

| Document | Contents |
| --- | --- |
| `docs/decisions.md` | every design decision, with rationale |
| `docs/phase1-report.md` … `phase4-report.md` | build reports: backend, UI, integration, QA/security audit |
| `docs/security-audit-report.md` | security audit findings |
| `docs/live-verification-report.md` | what still needs a machine with real internet, and the exact checks to run |
| `docs/Landing page.md` | landing page brief, design system notes, copy deck |
| `android/README.md` | the Android shell |

## License

The source code in this repository is available under the
[MIT License](LICENSE).

The Boutiqo name, logo, site copy, illustrations, and documentation content
are **not** covered by that licence and remain © 2026 SidsVictus — all
rights reserved. See [LICENSE](LICENSE) for the full terms, including the
excluded-materials notice. 

