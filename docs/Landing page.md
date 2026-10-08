# Landing page

Design brief, design-system reference, copy deck and build workflow for the
standalone marketing page at **`/landing`**. The page sells one thing: *get the
Boutiqo Android app on your phone.*

## 1. Brief

- **Audience:** boutique / tailor owners (Hyderabad-first), on a phone.
- **Single job:** state what the app does, in facts, and hand the visitor a
  download button + QR card. Nothing else.
- **Not linked to the app** — no dashboard, no signup, no login links. The
  existing `/` auth card is untouched.
- **Tone:** quiet and factual. No superlatives, no testimonials, no metrics we
  can't back. If a line isn't a fact about the product, it doesn't ship.
- **Constraints (from the brief):**
  - Only colors already defined in `src/styles/tokens/colors.css`, with a hard
    line between **brand** and **standard** colors (§4).
  - Boutique themed: tailoring motifs — thread, stitches, needle, measuring
    tape, spool, calendar of due dates.
  - Elegant *moving* illustrations: hand-authored inline SVG + CSS animation.
    No icon packs, no raster images. **Zero new PNGs, zero new dependencies.**
  - Minimal noise: no feature matrix, no FAQ, no blog strip, no social icons.

## 2. Decisions locked

| Decision | Value |
| --- | --- |
| Route | `/landing` — brand-new, referenced nowhere, touches no test |
| Mood | Light throughout, plum accents (no dark hero, no carpet PNG) |
| Motion | Ambient loops + scroll reveals, all off under `prefers-reduced-motion` |
| Primary CTA | "Get the app" → the EAS build page (below) + QR card for desktop |
| Card visual | The full, scannable QR (plum `#4a071e` modules on blush, from the static EC-H matrix) rendered as a three.js tile field: a slow vortex assembly (~3s — every tile spirals in from a swirling shell with velocity streaks, tumble and white-hot→red→plum heat, snapping centre-first), then the code is **completely pristine and still** (no effects) for the scan window, and the same spiral plays backwards to dissolve it at 7s — 8s loop; the "b" logo (`android/assets/splash-icon.png`, its own colours) as a small centre watermark; sparse signal-red `#ff254c` dust drifts left to right; static SVG fallback |
| Language | en-IN, ₹ amounts, "colour"/"colours" spelled consistently |

### The download URL (the one constant)

```
https://expo.dev/accounts/siddddark/projects/boutiqo/builds/68faafb8-1144-45d3-bd19-bf7da3614267
```

Lives in exactly one place: `DOWNLOAD_URL` in
`src/components/landing/download.ts`. The button reads it.

**Extracted app facts** (from the Expo project + `android/app.json`, all
verified — nothing invented for the page):

- App name **Boutiqo**, Expo project `@siddddark/boutiqo`, account `siddddark`.
- **Android only**, distributed as a direct `.apk` (not the Play Store).
- Current version **1.1.1** (versionCode 3), package `com.boutiqo.app`.
- The build page opens the EAS build → visitor downloads the APK → Android
  asks to allow install from that source → Install.

## 3. Page architecture

```
┌──────────────────────────────────────────────────────────┐
│ HEADER   boutiqo·(dot)                      [Get the app]│
├──────────────────────────────────────────────────────────┤
│ HERO                                             (light) │
│   ORDER BOOK FOR BOUTIQUES                     eyebrow  │
│   Your order book,               Svetze, plum  h1       │
│   on your phone.                               needle +  │
│   Orders, measurements, delivery dates and    thread     │
│   payments — one app for your boutique.       draws line │
│   [ Get the app → ]   Android · APK · v1.1.1  CTA       │
│   (desktop: QR card beside CTA)                              │
├──────────────────────────────────────────────────────────┤
│ STAGES                                            (n-25) │
│   Every order moves through five stages        h2       │
│   ●──────●──────●──────●──────●   thread sews on scroll  │
│   Received Cutting Stitching Ready Delivered             │
│   caption: you advance the stage, the due date is kept   │
├──────────────────────────────────────────────────────────┤
│ TRACKING                                       (blush-50)│
│   Send your customer a link                    h2       │
│   copy: opens in WhatsApp — stage, due date, balance,    │
│   cloth photo. No account, no app needed.                │
│   [ floating order-card mock: BQ-0142 · progress bar ·   │
│     Due 14 Sep · Balance ₹2,500 · Message button ]       │
├──────────────────────────────────────────────────────────┤
│ FACTS (3 vignettes)                                 (n-25)│
│   Dictate measurements   ·  See the busy days  ·  Track  │
│   14 measures by voice      every date by load   every   │
│   or typing (tape SVG)      (calendar SVG)       rupee   │
│                                       (balance bar SVG)  │
├──────────────────────────────────────────────────────────┤
│ DOWNLOAD band  (plum-700, the one dark accent)           │
│   Get the app · Android · v1.1.1                         │
│   [ Download for Android ]   [ QR card: scan with your phone ]│
│   Open on your phone → Allow install → Open              │
├──────────────────────────────────────────────────────────┤
│ FOOTER   boutiqo·   Privacy · Terms                      │
└──────────────────────────────────────────────────────────┘
```

Section order is fixed: header, hero, stages, tracking, facts, download,
footer. Nothing may be inserted between them without editing this doc.

## 4. Design system

Everything below is read from the existing tokens — no new color, size or
duration is ever hardcoded.

### 4.1 Color roles — brand vs standard (the hard line)

**BRAND — identity only** (the three ramps derived from the design handoff's
Pallet.png). Permitted on: wordmark, headlines, CTAs, illustration strokes,
the download band, the accent dot.

| Ramp | Tokens | Where it may appear |
| --- | --- | --- |
| Plum | `--plum-900…400`, key: `--plum-700 #4a071e` | Headline ink, primary button, download band bg, thread strokes |
| Blush | `--blush-50…400`, key: `--blush-100 #faeceb`, `--blush-200 #efcdca` | Section tints, illustration fills, button ink on plum, hairlines of brand character |
| Signal | `--signal-400…700`, key: `--signal-500 #ff254c`, `--signal-600 #e00c33` | The 7px brand dot, focus rings, one or two pinpoint accents (a knot, a needle eye) — never large areas |

Semantic brand aliases already defined (`--text-strong`, `--action-primary`,
`--action-accent`, `--line-brand`) are used instead of raw ramps where they
exist.

**STANDARD — structure only** (warm neutrals, hue-shifted so they never read
cold). Permitted on: page/card backgrounds, body copy, borders, captions.

| Group | Tokens | Where |
| --- | --- | --- |
| Surfaces | `--surface-page n-25`, `--surface-card n-0`, `--surface-sunken n-50`, `--surface-blush` | Page bands alternate n-25 / blush-50; cards are n-0 |
| Text | `--text-body n-700`, `--text-muted n-600`, `--text-faint n-500`, `--text-inverse blush-50` | Body, captions, copy on the plum band |
| Lines | `--line-hairline n-100`, `--line-default n-200`, `--line-strong n-300` | Card borders, dividers |

**STATUS — functional only** (the tokens file's own rule: *"used only for
order stage + load, never decoratively"*). Amber/green/stage/whatsapp hues may
appear **only** where the page depicts a real product state:

- the five stage dots (received/cutting/stitching/ready/delivered tokens),
- the tracking card's stage bar and WhatsApp button (`--whatsapp`),
- the calendar vignette's load dots (`--load-0…4`).

They may never brand a section, a link or a heading.

### 4.2 Type

| Role | Font | Notes |
| --- | --- | --- |
| Wordmark, h1, section h2 | `--font-display` (Svetze) | Sentence case, `--ls-display`; Svetze is the pre-launch license caveat (README) — same status as everywhere else in the app |
| Eyebrows, labels | Aptos semibold, `--ls-caps` | 13–14px, muted plum or `--text-muted` |
| Body, buttons, captions | `--font-sans` (Aptos) | 16–18px, `--lh-normal` |
| Order codes, ₹ figures in mocks | `--font-mono` (Aptos Mono) | `--type-numeric-font` |

Size scale: h1 `clamp(--fs-5xl → --fs-6xl)`, h2 `--fs-4xl`, body `--fs-md`.
Line heights: `--lh-tight` display, `--lh-snug` headings, `--lh-normal` body.

### 4.3 Space, shape, elevation, motion

- Spacing: 4px grid (`--space-1…12`); section padding `--space-11` mobile /
  `--space-12` desktop; container `--layout-app-max` (1200px), gutters
  `--space-4…7`.
- Radius: cards `--radius-card` (20px), buttons `--radius-control` (14px),
  chips/pills `--radius-pill`.
- Elevation: cards `--shadow-sm`, floating tracking card `--shadow-lg`, the
  QR card `--shadow-md`. Shadows are plum-tinted already — never neutral.
- Motion: durations `--dur-base/slow/slow+`; easing `--ease-out` for reveals,
  `--ease-standard` for state. Ambient loops are slow (6–14s), linear or
  ease-in-out, opacity/transform/stroke only.
- Breakpoint: single `1024px` media query, same as the app shell. Below it the
  stage thread runs vertical and the card hides (phones open the link directly);
  above it the thread runs horizontal and the hero shows the card.
- `prefers-reduced-motion: reduce` → every keyframe animation and reveal
  transition is disabled; revealed elements render in their final state.

## 5. Illustration & motion catalogue

All artwork is inline SVG authored in `src/components/landing/` — stroke-based,
`currentColor`/token colors, 1.5–2px strokes, round caps. No `<img>`, no icon
library.

| # | Piece | Section | Motion |
| --- | --- | --- | --- |
| 1 | **Running-stitch divider** | between sections | dashed `stroke-dasharray` line whose offset marches slowly forever (ambient) |
| 2 | **Needle & thread** | hero | needle sits at the end of a thread that path-draws (`stroke-dashoffset`) an underline beneath the h1 on load; thread sways ±2px, 8s |
| 3 | **Stage stitch** | stages | thread across five knots "sews itself" when the section enters view (reveal + 1.2s dash draw), knots pop in sequence, labels fade up |
| 4 | **Order-card mock** | tracking | card rises 16px on reveal; progress bar fills to "Stitching" on reveal; stage pills stagger in; ambient: card floats 3px/6s |
| 5 | **Measuring tape** | facts | tape blade extends from its case on reveal, tick marks fade in; ambient: 1px extend/retract, 7s |
| 6 | **Load calendar** | facts | 3×3 cells; load dots pop on reveal in sequence; ambient: the busiest dot breathes opacity |
| 7 | **Balance bar** | facts | advance segment (plum) + balance segment (blush) split on reveal; ₹ figures count in with the reveal (no JS counter — static text, bar animates) |
| 8 | **Spool of thread** | hero corner / download band | slow continuous rotation, 14s, blush stroke at low opacity (ambient) |
| 9 | **QR card** | hero (desktop) + download | blush stage with the EC-H QR as an `InstancedMesh` of plum `#4a071e` boxes (one per module): vortex assembly 0–3s (per-tile spiral of radius/angle/depth, velocity-aligned streak stretch, tumble, heat colour, back-out snap, centre-first stagger), pristine still hold 3.3–7s (no effects — the scan window), spiral reversed for dissolve 7–8s; "b" logo (`splash-icon.png`, own colours, 26% @ centre) as watermark; sparse signal-red `#ff254c` dust (22 points, 2 layers) drifts L→R on a cycle envelope; camera = pointer parallax only (dead still otherwise); static SVG shows under reduced motion / no WebGL (three via client dynamic import, code-split) |

Reveals: one client component, `Reveal.tsx` — IntersectionObserver adds
`is-in` once at 15% visibility; CSS transitions do the work. No animation
library, no scroll listener, no JS per frame.

## 6. Copy deck (source of truth for wording)

**Approved facts** (each is verifiable in the product):

1. It is an order book for boutiques, on your phone.
2. Orders move through five stages: Received, Cutting, Stitching, Ready,
   Delivered.
3. The owner advances the stage; the due date is tracked by the app.
4. The customer gets a WhatsApp link showing stage, due date, balance and
   cloth photo — no account, no app needed.
5. 14 measurements, dictated by voice or typed.
6. The calendar colours each delivery date by how busy that day is.
7. Every order carries total, advance and balance; mark paid when it settles.
8. Android app, direct APK install, version 1.1.1.

**Banned:** *best, seamless, powerful, effortless, revolutionise, transform,
game-changer, 10x, loved by, trusted by, all-in-one, "why wait", any
percentage or user count we cannot source.* No exclamation marks.

**Final strings** (mirrored in `page.tsx`):

- Eyebrow: `ORDER BOOK FOR BOUTIQUES`
- H1: `Your order book, on your phone.`
- Hero sub: `Orders, measurements, delivery dates and payments — one app for
  your boutique.`
- CTA: `Get the app` · caption: `Android · APK · v1.1.1`
- Stages h2: `Every order moves through five stages`
- Stages caption: `You advance the stage. The due date is tracked for you.`
- Tracking h2: `Send your customer a link`
- Tracking body: `It opens in WhatsApp with the stage, due date, balance and
  cloth photo. No account, no app needed.`
- Facts: `Dictate measurements` / `Fourteen measurements, by voice or typing.`
  — `See the busy days` / `Every delivery date, coloured by workload.`
  — `Know what is owed` / `Total, advance and balance on every order.`
- Download h2: `Get the app` · line: `Android · version 1.1.1 · direct APK
  install` · button: `Download for Android` · card caption: `Scan with your
  phone` · steps: `Open on your phone · Allow install · Open`
- Footer: `Privacy`, `Terms`

## 7. Workflow (build order)

1. **This doc** — brief, system, copy locked before any code.
2. **QR card** — `qr-matrix.ts` supplies the 53×53 EC-H matrix (`QR_ROWS`);
   `QrCode.tsx` keeps a static SVG path (plum on blush, quiet zone 4) as
   the reduced-motion/no-WebGL fallback; `qr-fx.ts` builds the three.js
   scene — instanced tiles per dark module, spiral-in vortex assembly,
   pristine hold, spiral-out dissolve, sparse red dust. No runtime QR
   library.
3. **Styles** — `src/styles/landing.css`, `.bq-lp-*` namespaced, imported
   once from `globals.css`. Tokens only.
4. **Components** — `src/components/landing/`: `Reveal.tsx`, `QrCode.tsx`,
   `illustrations.tsx` (pieces 1–8), `download.ts` (URL constant).
5. **Page** — `src/app/landing/page.tsx`, server component + `metadata`
   export, `Reveal` islands for the interactive parts.
6. **Verify** — `npm run lint`, `npm run build`, `npm test`; check 390px and
   ≥1024px layouts; check reduced-motion; confirm `/` and its e2e specs are
   untouched.
7. **README** — rewrite after the landing ships (separate task; current
   README is stale).

## 8. Open items

- **Download URL is an EAS build *page***, not a direct file URL. It was
  login-walled when fetched from a cold browser during this build — verify it
  opens for a logged-out phone before sharing the page publicly. Swap
  `DOWNLOAD_URL` for a public artifact/distribution link if it doesn't.
- Future: a second CTA into the web app (owner login) — add only when asked,
  via this doc first.
- Svetze commercial license still required before production (pre-existing
  blocker, applies here too).

## 9. Technical notes & risks

- `/landing` appears in no e2e spec → zero test breakage by construction.
  `npm test`, lint and build must stay green after every step.
- `ShellBridge` keys status-bar style off `.bq-auth-bg`, which `/landing`
  deliberately does not use → light page, dark status-bar icons; correct.
- Server component page + client islands only (`Reveal`); `metadata` export
  stays legal.
- No `lucide-react`, no `<img>`; the one added package is `three` (client
  dynamic import, code-split — the card's whole scene: `qr-fx.ts`). The QR
  is drawn from the matrix in `qr-matrix.ts` (instanced tiles + static SVG
  fallback); no runtime QR library.
- SEO: unique `title`/`description` in `metadata`; the root `/` keeps its own.
