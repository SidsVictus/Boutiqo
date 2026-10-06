# Boutiqo Android app

A thin Android shell (Expo + React Native + TypeScript) that loads the
production Boutiqo web app, **https://boutiqoo.netlify.app**, in a WebView.
It is distributed as a directly-shared `.apk`, not through Google Play.

```
Browser ─┐
         ├─► same Next.js web app ─► Supabase Auth + Postgres (RLS) ─► R2 (via /api/uploads/*)
APK ─────┘   (WebView)
```

The web app stays the single source of truth for UI, business logic, auth
and storage. The shell contains **no** product screens, no Supabase client,
no R2 code and no secrets. Its only jobs are:

| Concern | Where |
| --- | --- |
| Load the web app, keep the splash up until it has rendered | `App.tsx` |
| Android back button: go back in web history, exit only at the start | `App.tsx` (`BackHandler`) |
| Keep the web app's origin inside the WebView and send everything else to Android (browser, WhatsApp, dialer, mail…); block `javascript:`, `file:`, unknown schemes | `src/navigation.ts` |
| Offline banner, offline/error/timeout screens with retry, automatic retry on reconnect/resume | `App.tsx`, `src/StatusScreen.tsx` |
| Web app URL + HTTPS enforcement | `src/config.ts` |
| Google sign-in via a secure browser tab (Google blocks it inside WebViews) | `src/oauth.ts`, `App.tsx` (`onMessage`) |
| Voice input for measurements: Android's speech recognizer, text streamed to the web app | `src/voice.ts`, `App.tsx` (`startVoice`) |
| Full screen (edge to edge): the page draws under the status and navigation bars and is told their sizes; status-bar icons follow the page (light on the sign-in carpet, dark on app pages) | `src/edge.ts`, `App.tsx` |
| Dev-only logging, with query strings and `/track/<token>` redacted | `src/log.ts` |

## Native features: what is and isn't native

- **Cloth photo upload / camera**: no native code. The web app's
  `<input type="file" accept="image/…">` opens Android's picker inside the
  WebView, which offers both the gallery and "take photo" via the phone's
  camera app. The chosen file goes through the existing
  `/api/uploads/presign` → R2 → `/api/uploads/confirm` flow, unchanged.
  The app deliberately does **not** declare the `CAMERA` permission: with it
  declared, the WebView would have to ask for it, and without it, Android lets
  the system camera app take the photo on the app's behalf. So there's no
  permission prompt, and there's no camera code to maintain.
- **Google sign-in**: Google refuses OAuth inside embedded WebViews, so this
  is the one native feature. The shell injects `window.BoutiqoShell` with its
  redirect URL. The web app's "Continue with Google" then posts the Supabase
  authorize URL to the shell instead of navigating to it. The shell opens that
  URL in a Chrome Custom Tab (`expo-web-browser`). Supabase redirects back to
  `boutiqo://auth-callback?code=…`, and the shell loads the web app's
  `/auth/callback?code=…` in the WebView. The PKCE verifier cookie from the
  start of the flow is there, so the session ends up inside the app. There's
  still one auth system (Supabase) and no native auth code.
- **Voice input** (since 1.1.0): Android's WebView has a
  `webkitSpeechRecognition` object, but it never returns results, so the web
  app's mic did nothing in the app. The shell now uses
  `expo-speech-recognition` (Android's own `SpeechRecognizer`, free). The web
  app posts `{type: "boutiqo:voice", action: "start"}`. The shell asks for the
  microphone permission, recognises speech in `en-IN` and sends the text back
  as `boutiqo:voice` events. The web app does all the parsing and UI
  (`src/lib/voice/` in the web app). The shell stores no audio, and the
  recognition stops when the page changes or the app goes to the background.
  This module isn't in Expo Go, so there the web app shows its keyboard-mic
  fallback. Use a built APK to test voice.
- **Downloads**: the web app has no file-download flows (R2 images are shown
  inline via presigned URLs), so there's no native download handling.
- **Permissions**: `INTERNET`, `RECORD_AUDIO` (voice input only; it's asked
  for the first time the mic is tapped), plus
  `ACCESS_NETWORK_STATE`/`ACCESS_WIFI_STATE` from NetInfo (offline detection).
  Camera, storage, media, location, overlay and vibrate are explicitly
  blocked in `app.json`.
- `allowBackup` is off, so Android cloud backups can't copy the WebView's
  session cookies off the device.

Before adding anything native, first check whether the web app can already do
it inside the WebView. If it truly can't, record in this README why the
WebView wasn't enough and how the feature uses the existing backend.

## Setup

Requires Node 20+ and npm. You don't need Android Studio.

```bash
cd android
npm install
cp .env.example .env.local   # optional, see Environment
```

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_WEB_APP_URL` | `https://boutiqoo.netlify.app` | Web app to load. Release builds refuse non-HTTPS URLs and show an error screen instead. |

That's the only variable. **Anything prefixed `EXPO_PUBLIC_` ends up inside
the APK, where anyone can read it.** Never put Supabase service-role keys, R2
keys or any other secret here. The shell doesn't need them.

- **Production**: set in `eas.json` for both build profiles.
- **Development against a local Next.js server**: run `npm run dev` in the
  repo root, then set `EXPO_PUBLIC_WEB_APP_URL=http://<your-computer's-LAN-IP>:3000`
  in `android/.env.local`. Don't use `localhost`: on the phone, that's the
  phone. Supabase Auth's redirect allow-list and R2's CORS policy must include
  that origin, as for any other web origin (see the root README).

## Development: run on a physical phone

```bash
cd android
npm start          # Expo dev server; shows a QR code
```

1. Install **Expo Go** from the Play Store on an Android phone. It has to
   support **SDK 57**, the `expo` version in `package.json`.
2. Put the phone on the same Wi-Fi as your computer and scan the QR code in
   Expo Go.
3. Edits to `App.tsx`/`src/` reload instantly. Changes to the web app show up
   when you reload the page (shake the phone, then Reload).

Every native module this app uses except speech recognition (WebView, NetInfo,
safe-area, splash screen) is bundled in Expo Go. Voice input needs a built APK.
Everything else can be tested in Expo Go. If you ever
add a module that isn't in Expo Go, build a development client with
`npx eas-cli@latest build --profile development` (after adding a
`development` profile with `"developmentClient": true` to `eas.json`) and
install it the same way as the APK below.

WebView debugging: in development, open `chrome://inspect` on your computer
with the phone connected over USB (USB debugging on) to inspect the web app
running inside the shell. `devLog` output appears in the Expo terminal.

Checks:

```bash
npm run typecheck
npm test           # URL routing + config unit tests (node:test)
npm run doctor     # expo-doctor dependency/config check
```

## Production APK

Builds run on Expo's EAS servers. You need a free Expo account; nothing is
built locally, so no Android SDK is needed.

```bash
cd android
npx eas-cli@latest login
npx eas-cli@latest init        # first time only: links the project, writes extra.eas.projectId into app.json. Commit that.
npm run build:apk              # = eas build --platform android --profile production
```

- On the first build, let EAS **generate and store the Android keystore**.
  Every later APK must be signed with that same key, or Android refuses to
  install it over the existing app, and users would have to uninstall first
  and lose their login. Don't delete it from the Expo account. Back it up
  with `npx eas-cli@latest credentials`.
- `production` and `preview` both produce an `.apk` (`buildType: "apk"`),
  not an AAB. `preview` is for test APKs to hand to a few testers.
- When the build finishes, EAS prints a download link (also under
  expo.dev → your project → Builds). Download the `.apk` and rename it to
  **`boutiqo-v<version>.apk`**, e.g. `boutiqo-v1.0.0.apk`.

### Versioning

Both live in `app.json`:

| Field | Meaning | Rule |
| --- | --- | --- |
| `expo.version` | Version name users see (`1.0.0`) | MAJOR.MINOR.PATCH |
| `expo.android.versionCode` | Integer Android uses to decide what counts as an update | **+1 on every APK you distribute** |

Example: `1.0.0`/`1` → next native release `1.0.1`/`2`. `eas.json` sets
`appVersionSource: "local"`, so these `app.json` values are what gets built.

**Never change `android.package` (`com.boutiqo.app`)** after the first APK
goes out. A different ID installs as a separate app.

## Distribution

1. Build and download the APK, then rename it `boutiqo-v1.0.0.apk`.
2. Install that exact file on a physical phone and run the smoke test below.
3. Share it directly: WhatsApp, Drive link, email, etc.

Instructions to send users along with it:

> 1. Download **boutiqo-v1.0.0.apk** and tap it.
> 2. If Android asks, allow installing apps from this source (WhatsApp/Chrome/Files), then go back.
> 3. Tap **Install**, then **Open**.
> 4. Log in with your usual Boutiqo account.
>
> Updating later: install the new APK the same way. Your data stays; you may need to log in again only if your session expired.

## Update model

| Change | Examples | What to do |
| --- | --- | --- |
| **Web-only** | UI, new pages, copy, frontend fixes, business logic, API changes, anything in `src/` of the Next.js app | Deploy the web app (Netlify). **No new APK.** Users get it the next time a page loads or they reopen the app. |
| **Native** | Anything in `android/`: new Expo/native module, permission, icon, splash, app name, `app.json`, shell behaviour | Bump `version` + `versionCode`, build a new APK, share it. Users install it over the old one. |

Caching: the WebView uses normal HTTP caching (`LOAD_DEFAULT`). Next.js
serves HTML that's revalidated on each request and content-hashed JS/CSS, so a
new web deploy reaches the app on the next page load. Nothing needs to be
cleared, and the app never pins an old version.

## Known limitations

- **Google sign-in returns via the website.** Supabase sends the result to
  `https://boutiqoo.netlify.app/auth/app-callback`, which forwards it to the
  app (`boutiqo://auth-callback`, or `exp://…` in Expo Go). Only
  `https://boutiqoo.netlify.app/**` needs to be in Supabase's Redirect URLs;
  matching custom schemes there proved unreliable, which left users signed in
  on the website inside the sign-in tab.
- The web app's `Permissions-Policy: camera=()` header doesn't affect the
  photo picker, which uses the system camera app rather than `getUserMedia`.

## Physical-device test checklist

Run on a real phone against the build you're about to distribute:

- [ ] APK installs; icon and name are "Boutiqo"; splash shows the logo; no white flash before the web app appears
- [ ] Owner login → dashboard; kill the app → reopen → still logged in; log out → login screen
- [ ] Expired session / protected URL redirects to login and back
- [ ] Dashboard → order → stage page: **Back** walks back page by page, then leaves the app from the first page
- [ ] New order wizard: text inputs, selects, date fields; keyboard doesn't hide the focused field or the submit button; submitting works
- [ ] Cloth photo: "Take / choose photo" → camera → photo uploads (progress bar → Uploaded); same from the gallery
- [ ] External link (any `https://` outside the app, `tel:`, `mailto:`) opens the right Android app; returning shows the same page
- [ ] Airplane mode on launch → offline screen → turn it off → the app loads on its own
- [ ] Airplane mode while using the app → offline banner; the page stays; off again → banner goes away
- [ ] Background for a few minutes → resume → same page, still logged in
- [ ] Portrait only; status bar and gesture/nav bar don't cover content; small and large screen
- [ ] Customer tracking link `/track/<token>` opens and shows the order
- [ ] New order → Voice → mic: Android asks for the microphone once; the mic indicator shows; saying "14 15, chest 36" fills 1, 2 and 10; pausing doesn't stop it; tapping the mic stops it
