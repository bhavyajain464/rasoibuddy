# Staging / develop environment

The **develop** branch is the integration environment. **main** stays production.

| Layer | Production (`main`) | Staging (`develop`) |
| --- | --- | --- |
| Git branch | `main` | `develop` |
| Web (Vercel) | Project **kitchmate** → [kitchmate-one.vercel.app](https://kitchmate-one.vercel.app) | Project **kitchmate-staging** → [kitchmate-staging.vercel.app](https://kitchmate-staging.vercel.app) (`develop`) |
| API (Cloud Run) | `kitchenai-backend` | `kitchenai-backend-staging` |
| Razorpay | Live (`RAZORPAY_ENV=production`) | Test (`RAZORPAY_ENV=staging`) |
| DB / Redis / Kafka / LLM keys | Shared (same GCP secrets for now) | Same secrets as production |

## Git workflow

```bash
git checkout develop
git pull origin develop
# feature work → PR into develop; when ready → PR develop → main
```

Create the branch once (already done if you see `origin/develop`):

```bash
git checkout -b develop
git push -u origin develop
```

## Backend (Cloud Run staging)

- **Workflow:** `.github/workflows/deploy-backend-staging.yml` runs on push to `develop` when `backend/**` changes.
- **Service:** `kitchenai-backend-staging` in `asia-south1` (project `kitchmate-495620`).
- **Image:** `gcr.io/kitchmate-495620/kitchenai-backend-staging`.
- **API base URL (for frontend):** `https://kitchenai-backend-staging-208103249970.asia-south1.run.app/api/v1`

Manual deploy (optional):

```bash
cd backend
gcloud run deploy kitchenai-backend-staging \
  --source . \
  --project kitchmate-495620 \
  --region asia-south1 \
  --allow-unauthenticated
```

Production deploys are unchanged: `.github/workflows/deploy-backend.yml` on `main` only.

## Frontend (Vercel staging)

Project **kitchmate-staging** should be linked to `bhavyajain464/kitchmate` with:

- **Root directory:** `frontend/kitchenai-frontend`
- **Production branch:** `develop` (so every merge to `develop` updates the staging site)
- **Build / output:** same as production (`vercel.json` in the frontend folder)

Required environment variables (Production target on the **kitchmate-staging** project):

| Variable | Staging value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `https://kitchenai-backend-staging-208103249970.asia-south1.run.app/api/v1` |
| `EXPO_PUBLIC_GOOGLE_*` | Same OAuth client IDs as production (for now) |
| `EXPO_PUBLIC_WEB_REDIRECT_URI` | `https://kitchmate-staging.vercel.app` |

Copy OAuth redirect URIs in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) for the **Web** client: add `https://kitchmate-staging.vercel.app` to **Authorized JavaScript origins** and **Authorized redirect URIs** (see `GOOGLE_OAUTH_SETUP.md`).

**One-time (Vercel dashboard):** Project **kitchmate-staging** → Settings → Environments → Production → Branch Tracking → set branch to **`develop`** (so merges to `develop` update the staging URL, not only preview aliases).

CLI helpers (from `frontend/kitchenai-frontend`):

```bash
vercel link --project kitchmate-staging --yes
vercel env add EXPO_PUBLIC_API_BASE_URL production
vercel git connect https://github.com/bhavyajain464/kitchmate.git
```

## Local builds against staging API

Copy `staging.env.example` → `staging.env` (gitignored) and run:

```bash
DOTENV_CONFIG_PATH=staging.env npm run web
```

## What stays shared (for now)

- PostgreSQL (`database-url` secret)
- Redis, Kafka, Groq/Gemini keys
- Google OAuth clients (add staging redirect URIs only)

Splitting staging DB or Kafka topics is a later step when you want isolated data.

