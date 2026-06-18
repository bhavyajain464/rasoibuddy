# Rasoibuddy Partner (Expo)

Restaurant staff app — POS, menu, stock, procurement. **Separate UI** from the consumer Rasoibuddy app (dark ops theme vs consumer green home app).

Runs on **web, iOS, and Android** (same Expo stack as `kitchenai-frontend`).

## Setup

```bash
cd frontend
npm install

cd kitchenai-restaurant
cp prod.env.example prod.env   # adjust API URL / OAuth IDs if needed
npm run start    # Metro port 8083
npm run web
```

Add your restaurant web origin (e.g. `http://localhost:8083`) to Google OAuth authorized origins.

Apply backend migration `017_restaurant_platform.sql` before using restaurant routes.

## Android (local dev)

Prerequisites: Android Studio, an emulator or USB device with debugging enabled, JDK 17+.

```bash
cd frontend/kitchenai-restaurant

# First-time: generate native project and install dev build on device/emulator
npm run android

# Daily workflow (two terminals, or one command):
npm run start              # terminal 1 — Metro on :8083
npm run android:launch       # terminal 2 — opens dev client → Metro

# Or combined:
npm run android:dev
```

- Package id: `com.kitchenai.restaurant` (separate from consumer `com.kitchenai.app`)
- Local API: `prod.env` uses `http://localhost:8080`; the app rewrites to `10.0.2.2` on the emulator automatically
- **Google Sign-In:** Register the debug/release SHA-1 for `com.kitchenai.restaurant` in Google Cloud Console (Android OAuth client `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`)

## Android (EAS / Play Store)

```bash
cd frontend/kitchenai-restaurant

# One-time: link EAS project (adds extra.eas.projectId to app.json)
npx eas-cli init

# Internal dev APK
npx eas-cli build --platform android --profile development

# Production AAB (staging API — see eas.json)
npm run build:android:production
```

## Architecture

- **No shared UI packages** — all screens live in this app (`src/screens/`).
- **`@kitchenai/api-core`** — shared HTTP/auth helpers only (not UI).
- **Consumer app** (`kitchenai-frontend`) — completely separate codebase and design.

## API

Restaurant routes: `/api/v1/restaurant/*` — see `backend/internal/restaurant/transport/http/handlers.go`.
