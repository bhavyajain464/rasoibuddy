# 🚀 Quick Setup Guide

## Prerequisites

1. **PostgreSQL**: Install PostgreSQL 14+ or use Supabase
2. **Go**: Version 1.22+ (repo targets 1.25)
3. **Node.js**: Version 18+ with npm
4. **Expo CLI**: For React Native development

## Step-by-Step Setup

### 1. Clone and Navigate
```bash
git clone <repository-url>
cd Kitchenai
```

### 2. Database Setup
```bash
# Option A: Local PostgreSQL
createdb kitchenai
chmod +x backend/migrations/apply_all.sh
./backend/migrations/apply_all.sh kitchenai

# Option B: Supabase
# 1. Create a new project on supabase.com
# 2. Run each file in backend/migrations/ in order (000 → 005) in the SQL editor
#    See backend/migrations/README.md
# 3. Note your database connection string
```

### 2b. Razorpay (Premium checkout, optional)

In `backend/.env`:

```bash
# staging = Test Mode keys; production = Live Mode keys
RAZORPAY_ENV=staging
RAZORPAY_KEY_ID_STAGING=rzp_test_...
RAZORPAY_KEY_SECRET_STAGING=...
RAZORPAY_WEBHOOK_SECRET_STAGING=...   # from Dashboard → Webhooks (test)
RAZORPAY_PREMIUM_AMOUNT_PAISE=49900   # ₹499
```

For production deploy, set `RAZORPAY_ENV=production` and `RAZORPAY_KEY_ID_PRODUCTION` / `RAZORPAY_KEY_SECRET_PRODUCTION` / `RAZORPAY_WEBHOOK_SECRET_PRODUCTION`.

Webhook URL (no auth): `POST https://<your-api>/api/v1/billing/razorpay/webhook` — subscribe to `payment.captured`.

**Test payment (India, Test Mode):** use domestic card `5267 3181 8797 5449` — not `4111 1111 1111 1111` (that is international and fails unless you enable International Cards in the dashboard). OTP: `123456` (4+ digits). Or use UPI in the checkout modal.

Apply migration `006_razorpay_orders.sql` if not using `apply_all.sh`.

### 2c. Admin API (subscription cancel)

Set a strong secret in `backend/.env`:

```bash
ADMIN_API_KEY=your-long-random-secret
```

Cancel a user's subscription immediately (revokes Pro/Elite access):

```bash
curl -X POST http://localhost:8080/api/v1/admin/subscriptions/cancel \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"email":"user@example.com","reason":"support request"}'
```

Use `user_id` instead of `email` if you have the UUID. Razorpay is not auto-refunded; this only updates Kitchmate entitlements.

Refresh **per-user** Meal of the Day in Redis (respects dietary prefs; free tier reads `GET /meals/meal-of-day`). Requires `REDIS_URL`:

```bash
curl -X POST http://localhost:8080/api/v1/admin/meal-of-day/refresh \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"email":"you@example.com"}'
```

Or refresh all users: `-d '{}'`. The API also generates on first load if today's cache is missing.

### 3. Backend Setup
```bash
cd backend

go mod download

# Copy and edit env (see backend/.env.example)
cp .env.example .env
# Required at minimum: DATABASE_URL, GOOGLE_CLIENT_ID, SESSION_TOKEN_SECRET,
# and LLM keys (GROQ_* with LLM_PROVIDER=groq, or GEMINI_* with LLM_PROVIDER=gemini).

# Run API (loads .env from this directory when present)
go run ./cmd/api
```

### 4. Frontend Setup
```bash
cd frontend/kitchenai-frontend

# Install dependencies
npm install

# Set EXPO_PUBLIC_API_BASE_URL in .env (e.g. http://localhost:8080/api/v1)

# Start Expo (web often uses port 8082, e.g. npx expo start --web --port 8082)
npx expo start

# Scan QR code with Expo Go app (iOS/Android)
```

### 5. MCP Server Setup (Optional)
```bash
cd mcp-server

# Install dependencies
npm install

# Build and run
npm run build
npm start
```

## Testing the System

### Test Backend API
```bash
cd backend
chmod +x test_api.sh
./test_api.sh
```

Expected output:
- Health check returns `{"status": "healthy"}`
- Inventory endpoints return JSON data
- Inventory/meals work after you sign in and add data (migrations no longer seed sample rows)

### Test Frontend
1. Open Expo Go app on your phone
2. Scan QR code from terminal
3. App should show:
   - Kitchmate header
   - Inventory stats
   - Expiring items (sample data)
   - Quick action buttons

## Configuration Files

### Backend configuration
- Primary source: **`backend/.env`** (loaded automatically at startup).
- Reference: **`backend/.env.example`** — documents `DATABASE_URL`, `LLM_PROVIDER`, `GROQ_*`, `GEMINI_*`, `KAFKA_*`, `GOOGLE_CLIENT_ID`, `SESSION_TOKEN_SECRET`, pool tuning, etc.
- Code defaults live in **`backend/pkg/config/config.go`**.

### Frontend configuration (`frontend/kitchenai-frontend/.env`)
- `EXPO_PUBLIC_API_BASE_URL` — backend base URL including `/api/v1`
- Google OAuth `EXPO_PUBLIC_*` variables — see **`GOOGLE_OAUTH_SETUP.md`**

### MCP Server Configuration (`mcp-server/.env`)
```env
DATABASE_URL=postgres://user:password@localhost:5432/kitchenai
```

## Next Steps for Development

### Week 2: Vision Engine
1. Bill scanning is implemented against **Groq (default)** or **Gemini** via `LLM_PROVIDER`
2. Tune prompts and parsing in `backend/internal/services/` (`gemini.go`, `groq.go`, `llm_provider.go`)
3. Bill photos: configure `GOOGLE_VISION_API_KEY` on the backend (see `docs/GOOGLE_VISION_SETUP.md`)

### Cook / WhatsApp (current behavior)
1. Store cook **`phone_number`** (and optional **`cook_name`**) via **`PUT /api/v1/cook/profile`**
2. Meal / menu / generic WhatsApp endpoints return **`whatsapp_url`** — open in the app to send from the **user's** WhatsApp (no Twilio)
3. Optional **`GOOGLE_TRANSLATE_KEY`** for translation features where implemented

### Week 4: Reasoning Layer
1. Enhance "Rescue Meal" algorithm
2. Integrate recipe database
3. Implement meal planning logic

### Week 5: Frontend Polish
1. Add bill scanning UI
2. Implement real-time updates
3. Add push notifications

### Week 6: Beta Testing
1. Deploy to test environment
2. Onboard test households
3. Collect feedback and iterate

## Troubleshooting

### Database Connection Issues
```bash
# Test PostgreSQL connection
psql -h localhost -p 5432 -U postgres -d kitchenai

# Check if tables exist
psql -d kitchenai -c "\dt"
```

### Go Backend Issues
```bash
# Check Go version
go version

# Clean build
go clean -modcache
go mod tidy
go run ./cmd/api
```

### React Native Issues
```bash
# Clear Expo cache
npx expo start --clear

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### MCP Server Issues
```bash
# Check TypeScript compilation
npx tsc --noEmit

# Install missing dependencies
npm install @modelcontextprotocol/sdk pg dotenv
```

## Deployment

### Backend Deployment (Production)
```bash
# Build binary
cd backend
go build -o kitchenai-backend ./cmd/api

# Run (prefer a production .env or injected env vars)
DATABASE_URL="your_production_db" PORT="8080" ./kitchenai-backend
```

### Frontend Deployment
```bash
# Build for production
cd frontend/kitchenai-frontend
npx expo build:android
npx expo build:ios
```

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review the plan.txt for project requirements
3. Test with the provided test scripts

---

**🎉 Your Kitchmate foundation is now set up!** 
Proceed to Week 2 implementation as per the project plan.