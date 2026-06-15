# Rasoibuddy Partner (Expo)

Restaurant staff app — POS, menu, stock, procurement. **Separate UI** from the consumer Rasoibuddy app (dark ops theme vs consumer green home app).

Runs on **web, iOS, and Android** (same Expo stack as `kitchenai-frontend`).

## Setup

```bash
cd frontend
npm install

cd kitchenai-restaurant
# prod.env already has Google client IDs + API URL (copy from kitchenai-frontend if needed)
npm run start    # Metro port 8083
npm run web
npm run android
```

Add your restaurant web origin (e.g. `http://localhost:8083`) to Google OAuth authorized origins.

Apply backend migration `017_restaurant_platform.sql` before using restaurant routes.

## Architecture

- **No shared UI packages** — all screens live in this app (`src/screens/`).
- **`@kitchenai/api-core`** — shared HTTP/auth helpers only (not UI).
- **Consumer app** (`kitchenai-frontend`) — completely separate codebase and design.

## API

Restaurant routes: `/api/v1/restaurant/*` — see `backend/internal/restaurant/transport/http/handlers.go`.
