# Staging / develop environment

The **develop** branch is the integration environment. **main** stays production.

| Layer | Production (`main`) | Staging (`develop`) |
| --- | --- | --- |
| Git branch | `main` | `develop` |
| Consumer web (Vercel) | Project **kitchmate** → [kitchmate-one.vercel.app](https://kitchmate-one.vercel.app) | **Preview** on `develop` → [kitchmate-git-develop-bhavyajain464-9089s-projects.vercel.app](https://kitchmate-git-develop-bhavyajain464-9089s-projects.vercel.app) |
| Partner web (Vercel) | *(not deployed from `main` yet)* | Project **kitchmate-partner** — **production branch `develop`** → staging API |
| API (Cloud Run) | `kitchenai-backend` | `kitchenai-backend-staging` |
| Razorpay | Live (`RAZORPAY_ENV=production`) | Test (`RAZORPAY_ENV=staging`) |
| DB / Redis / Kafka / LLM keys | Shared (same GCP secrets for now) | Same secrets as production |

## Git workflow

```bash
git checkout develop
git pull origin develop
# feature work → PR into develop; when ready → PR develop → main
```

## Backend (Cloud Run staging)

- **Workflow:** `.github/workflows/deploy-backend-staging.yml` runs on push to `develop` when `backend/**` changes.
- **Service:** `kitchenai-backend-staging` in `asia-south1` (project `kitchmate-495620`).
- **API base URL:** `https://kitchenai-backend-staging-208103249970.asia-south1.run.app/api/v1`

Production deploys: `.github/workflows/deploy-backend.yml` on `main` only.

**Onboarding testing:** Staging API sets `ENVIRONMENT=staging`, so `/onboarding/status` always returns `onboarding_done: false` (onboarding shows every login, even after complete). Production is unchanged.

## Consumer frontend (Vercel project: **kitchmate**)

One Vercel project, two environments via **branch-scoped env vars**:

| Variable | Production (`main`) | Preview (`develop` branch) |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `https://kitchenai-backend-208103249970.asia-south1.run.app/api/v1` | `https://kitchenai-backend-staging-208103249970.asia-south1.run.app/api/v1` |
| `EXPO_PUBLIC_WEB_REDIRECT_URI` | `https://kitchmate-one.vercel.app` | `https://kitchmate-git-develop-bhavyajain464-9089s-projects.vercel.app` |
| `EXPO_PUBLIC_GOOGLE_*` | Same on both (add staging redirect URI in Google Cloud Console) | Same |

Pushes to **`develop`** create a **preview** deployment only (staging API/OAuth). **Production** web updates only when code lands on **`main`** (merge `develop` → `main`).

**Vercel (required):** In project **kitchmate** → Settings → Git → set **Production Branch** to `main`. Do not promote preview deployments to production manually from the dashboard.

**Google OAuth:** Add the develop preview origin to your Web client (see `GOOGLE_OAUTH_SETUP.md`):

- `https://kitchmate-git-develop-bhavyajain464-9089s-projects.vercel.app`

## Partner frontend (Vercel project: **kitchmate-partner**)

Separate Vercel project for `frontend/kitchenai-restaurant` (restaurant staff app).

| Setting | Value |
| --- | --- |
| Root directory | `frontend/kitchenai-restaurant` |
| Production branch | **`develop`** (deploys staging stack, not `main`) |
| Build | `vercel.json` → `npm run build:web:vercel` (Expo web export) |
| Install | `cd .. && npm install` (npm workspace for `@kitchenai/api-core`) |

**Production env vars** (Vercel → Settings → Environment Variables → Production):

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `https://kitchenai-backend-staging-208103249970.asia-south1.run.app/api/v1` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Same as consumer web client |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Same as consumer |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Same as consumer |
| `EXPO_PUBLIC_WEB_REDIRECT_URI` | Partner Vercel URL (e.g. `https://kitchmate-partner.vercel.app`) |

**Google OAuth:** Add the partner deployment origin to the Web client authorized JavaScript origins and redirect URIs (see `GOOGLE_OAUTH_SETUP.md`).

Local staging run:

```bash
cd frontend/kitchenai-restaurant
cp staging.env.example staging.env   # fill Google client IDs
npm run web:staging
```

## Local builds against staging API

Copy `staging.env.example` → `staging.env` (gitignored):

```bash
DOTENV_CONFIG_PATH=staging.env npm run web
```

## What stays shared (for now)

- PostgreSQL, Redis, Kafka, Groq/Gemini keys, Google OAuth clients (with extra redirect URI for develop preview)

Splitting staging DB or Kafka is a later step when you want isolated data.
