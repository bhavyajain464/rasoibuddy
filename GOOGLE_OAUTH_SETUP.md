# Google OAuth Multi-Platform Setup Guide

This guide explains how to configure Google OAuth for multi-platform support (Web, iOS, Android) in the Kitchmate application.

## Ports and env (current app)

- **Backend API**: `http://localhost:8080` (or your deployed URL). Paths live under `/api/v1`.
- **Expo web dev** often runs on **`http://localhost:8082`** — add that origin and matching **Authorized redirect URI** in the Google Cloud **Web client** if you use Expo web.
- **Web sign-in COOP**: `vercel.json` and `metro.config.js` send `Cross-Origin-Opener-Policy: same-origin-allow-popups` so Google’s `postMessage` flow works. After changing `metro.config.js`, **restart** `npm run web`. Redeploy Vercel for production.
- Frontend secrets live in **`frontend/kitchenai-frontend/.env`** (`EXPO_PUBLIC_*`). Backend uses **`backend/.env`** for `GOOGLE_CLIENT_ID` (server token verification) and `SESSION_TOKEN_SECRET`.

## Current Configuration

- **Backend Port**: 8080
- **Expo Dev Server Port**: 8082
- Keep real Google OAuth client IDs in local `.env` files or your deployment secrets, not in committed docs.

## Step 1: Create Three OAuth 2.0 Client IDs

Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials

### 1. Web Application Client
- **Type**: Web application
- **Name**: `kitchenai-web-client`
- **Authorized JavaScript origins**:
  - `http://localhost:8082` (Expo web, common local default)
  - `http://localhost:19006`
  - `http://<your-lan-ip>:19006`
  - `http://localhost:3000`
- **Authorized redirect URIs**:
  - `http://localhost:8082`
  - `http://localhost:19006`
  - `http://<your-lan-ip>:19006`
  - `http://localhost:3000`
- **Client ID**: Copy this value for `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

### 2. iOS Application Client
- **Type**: iOS application
- **Name**: `kitchenai-ios-client`
- **Bundle ID**: Get from `app.json` (currently not specified, needs to be set)
- **Client ID**: Copy this value for `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- **URL scheme**: `exp://<your-lan-ip>:8082` for Expo Go development, or your production scheme for builds

### 3. Android Application Client
- **Type**: Android application
- **Name**: `kitchenai-android-client`
- **Package name**: `com.kitchenai.app` (from `app.json`)
- **SHA-1 fingerprints** (add **every** key you ship with):
  - **Local / Expo dev** (debug keystore):
    ```bash
    keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
    ```
  - **Play Store production (required for store installs)** — this is the usual reason login works in dev but fails on the Play build:
    1. [Google Play Console](https://play.google.com/console) → your app → **Test and release** → **App integrity** (or **Setup** → **App signing**).
    2. Copy **SHA-1** (and SHA-256 if shown) under **App signing key certificate**.
    3. In [Google Cloud Console](https://console.cloud.google.com/) → **Credentials** → your **Android** OAuth client → add that SHA-1 with package `com.kitchenai.app`.
    4. If you use EAS Build, also add the **upload key** SHA-1 from [expo.dev](https://expo.dev) → project → **Credentials** → Android → keystore fingerprints (only needed for some internal tracks; Play-installed users use the **app signing** key).
  - Symptom when SHA-1 is wrong: `DEVELOPER_ERROR` on sign-in, or generic failure on production APK/AAB only.
- **Client ID**: Copy this value for `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- **Important**: `GoogleSignin.configure()` uses **`webClientId`** = the **Web** client ID (not the Android client ID). The Android OAuth client still must list the correct package + SHA-1.

## Step 2: Update Environment Variables

Update `frontend/kitchenai-frontend/.env` with the actual client IDs:

```env
# Google OAuth Client IDs for multi-platform support
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID_HERE
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID_HERE
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=YOUR_ANDROID_CLIENT_ID_HERE

# Redirect URIs
EXPO_PUBLIC_WEB_REDIRECT_URI=http://localhost:19006
EXPO_PUBLIC_IOS_REDIRECT_URI=exp://<your-lan-ip>:8082
EXPO_PUBLIC_ANDROID_REDIRECT_URI=exp://<your-lan-ip>:8082
```

Update `backend/.env` with the same first-party Google OAuth clients so the API accepts ID tokens from web, iOS, and Android:

```env
GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID_HERE
GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID_HERE
GOOGLE_ANDROID_CLIENT_ID=YOUR_ANDROID_CLIENT_ID_HERE
# Optional legacy fallback for older deployments:
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID_HERE
```

## Step 3: Update App Configuration

Update `frontend/kitchenai-frontend/app.json` with proper bundle ID and package name:

```json
{
  "expo": {
    "name": "kitchenai-frontend",
    "slug": "kitchenai-frontend",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.kitchenai"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false,
      "package": "com.yourcompany.kitchenai"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

## Step 4: Configure Backend CORS

The backend CORS configuration in `backend/cmd/api/main.go` already includes:
- `http://localhost:19006`
- your local Expo web / LAN origins during development

## Step 5: Test the Configuration

1. Restart the backend server:
   ```bash
   cd backend
   go run ./cmd/api
   ```

2. Start the Expo dev server:
   ```bash
   cd frontend/kitchenai-frontend && npx expo start --port 8082
   ```

3. Scan the QR code with Expo Go app on your iOS device.

4. Test Google Sign-In button in the app.

## Troubleshooting

### Common Issues

1. **"redirect_uri mismatch" error**:
   - Ensure the redirect URI in Google Cloud Console matches exactly what Expo is using
   - For iOS development: `exp://<your-lan-ip>:8082`
   - For Web: `http://localhost:19006` or your Expo web origin

2. **CORS errors**:
   - Check that the backend CORS configuration includes all necessary origins
   - Restart the backend after making changes

3. **Client ID not working**:
   - Ensure you're using the correct client ID type for each platform
   - Web client ID for web platform
   - iOS client ID for iOS platform
   - Android client ID for Android platform

4. **Login works in dev / emulator but not on Play Store build**:
   - Add **Play App signing** SHA-1 to the Android OAuth client (see step 3 above).
   - Confirm `EXPO_PUBLIC_API_BASE_URL` in the EAS production profile points at your live backend (e.g. Cloud Run `/api/v1`).
   - Backend must have `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, and `GOOGLE_ANDROID_CLIENT_ID` set (Cloud Run env vars).

## Notes

- Use the platform-specific client ID for each platform; do not reuse an iOS client ID as the web client ID.
- For production, you should use proper bundle IDs and package names.
- Consider using Expo Application Services (EAS) for building and distributing the app.
