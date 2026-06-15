# Kitchmate — App Product Guide

A single reference for how **Kitchmate** looks, flows, and behaves across web and mobile. Written for product, design, and engineering.

---

## 1. What Kitchmate is

**Kitchmate** is an all-in-one kitchen assistant for Indian homes. It connects meal planning, pantry tracking, grocery shopping, and cook coordination in one calm app — so families stop juggling notes, spreadsheets, WhatsApp threads, and recipe searches.

| | |
|---|---|
| **Brand name** | Kitchmate |
| **Motto** | *Less waste. Smarter meals. Calmer evenings.* |
| **USP** | All-in-one kitchen assistant |
| **Repo / package name** | Kitchenai (`com.kitchenai.app`, `kitchenai://` deep links) |

### Core loop

```
Set up pantry & preferences
        ↓
Get AI meal plans (week + on-demand)
        ↓
Shop only what the plan needs
        ↓
Send menus/lists to your cook on WhatsApp
        ↓
Log what you ate · reduce waste over time
```

---

## 2. Visual identity

### Color palette (herbal green + white)

| Role | Hex | Usage |
|------|-----|--------|
| Primary | `#2E7D32` | Headers, CTAs, active tab, key icons |
| Primary dark | `#1B5E20` | Pressed states, emphasis text |
| Primary container | `#E8F5E9` | Soft green fills, chips, suggestion cards |
| Background | `#FAFAFA` | App canvas |
| Surface | `#FFFFFF` | Cards, sheets, list rows |
| Text | `#1A1A1A` | Primary copy |
| Text secondary | `#666666` | Subtitles, metadata |
| Warning | `#E65100` / `#FFF8E1` | Expiring soon |
| Error | `#C62828` | Errors, destructive actions |
| WhatsApp | `#25D366` | Cook communication accents |

### Typography & components

- **React Native Paper** (Material Design 3 light theme)
- System fonts, ~12–14px corner radius on cards and buttons
- **Tab screen headers:** rounded green hero bar (`#2E7D32`, 28px bottom radius) with white title + subtitle; profile avatar button top-right
- **List items:** white cards on grey canvas, ingredient thumbnails, qty suffix (`Name · 2 kg`)
- **Bottom sheets:** meal suggestions, edit item, cook profile, scan bill

### Logo

- Transparent PNG (`assets/logo.png`, 1080×840)
- Used on login, onboarding, splash, marketing landing, force-update screen

---

## 3. Platforms & entry points

### Web

| URL | Screen |
|-----|--------|
| `/` | Marketing landing (unauthenticated) |
| `/login` | Sign in |
| `/app` | Home (authenticated) |
| `/inventory` | Inventory |
| `/meals` | Meals |
| `/cook` | Cook |
| `/shopping` | Shopping |
| `/profile` | Profile |
| `/privacy` | Privacy policy |

Unauthenticated users see the **landing page** first; native apps open **Login** directly.

### Native (iOS / Android)

- Bottom tab bar with five tabs
- Profile opened from header avatar (stack screen, not a tab)
- Deep link scheme: `kitchenai://`
- Portrait lock on phone
- Local notifications for meal-log reminders (lunch 1:30 PM, dinner 8:00 PM)

---

## 4. Navigation map

```
                    ┌─────────────────────────────────────┐
                    │         Force update (if required)   │
                    └─────────────────────────────────────┘
                                      ↓
              ┌───────────────────────┴───────────────────────┐
              │ Web only: Landing (/)  →  Login (/login)       │
              │ Native: Login directly                          │
              └───────────────────────┬───────────────────────┘
                                      ↓ Google sign-in
              ┌───────────────────────┴───────────────────────┐
              │ Onboarding (first login only, ~2 min)          │
              └───────────────────────┬───────────────────────┘
                                      ↓
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│    Home     │  Inventory  │    Meals    │    Cook     │  Shopping   │
│   /app      │ /inventory  │   /meals    │   /cook     │ /shopping   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
                                      │
                              Profile (/profile)
                              stack — back button
```

**Bottom tab icons:** Home · Inventory clipboard · Meals fork/knife · Cook pot · Shopping cart

---

## 5. Authentication & onboarding

### Sign in

- **Google only** — no email/password
- Web: Google Identity Services button (+ fallback)
- Native: `@react-native-google-signin/google-signin`
- Login screen: white logo header, green welcome card, three feature bullets (inventory, AI meals, smart shopping)

### Onboarding (first session)

Three steps, estimated ~2 minutes:

1. **Start** — Logo, motto, intro cards (how you eat → stock staples → personalized meals). Optional: join shared kitchen via invite code.
2. **Preferences** — Household size, dietary tags (veg, vegan, Jain, etc.), spice level, cuisines, allergies.
3. **Kitchen staples** — Categorized checklist (atta, dal, masala, etc.) with quantities; select all or per category.

Completing onboarding seeds the pantry and unlocks the main app.

---

## 6. Screen-by-screen guide

### 6.1 Marketing landing (web only)

**Purpose:** Sell the all-in-one USP before sign-in.

**Layout:**
- Sticky nav: Features · All-in-one · How it works · **Get started**
- Hero: “One app for your entire kitchen” + phone mockup (Dal Tadka, tab bar preview)
- Scrolling marquee of capabilities
- Stats strip (1 app, 500+ recipes, pantry-aware AI)
- **All-in-one hub** diagram: Meal plans · Pantry · Shopping · Rescue meals · WhatsApp for cook
- Before/after comparison (scattered tools vs Kitchmate)
- Feature grid, app showcase carousel, 3-step how-it-works
- Green gradient CTA band → Sign in with Google
- Footer: privacy policy

---

### 6.2 Home

**Header:** Time-based greeting (“Good Morning/Afternoon/Evening”) + first name + profile button. Green hero bar (no subtitle).

**Body (top to bottom):**

| Section | What it shows | What you can do |
|---------|---------------|-----------------|
| **Quick actions** | Horizontal carousel of 5 cards | Quick import (WhatsApp, native), Add item, Meal idea, Log meal, Add to list |
| **Meal of the day** | Breakfast / lunch / dinner from today’s week plan | Tap → open that day in week plan sheet |
| **Expired items** | Banner if anything expired | Tap → Inventory → Expired tab |
| **Expiring soon** | Up to 4 items with days-left pills | Tap item or “See all” → Inventory filtered |
| **Empty pantry** | CTA when count is 0 | Tap → add first items |

Pull-to-refresh reloads pantry stats and meal-of-day.

---

### 6.3 Inventory

**Header title:** Inventory  
**Subtitle:** *Your kitchen, perfectly tracked*

**Toolbar:**
- Search bar
- **+** menu: Add manually · Scan & add bill

**Tabs:** In stock | Expired

**Filters (In stock):** All · Expiring soon · food-group pills (dynamic counts)

**List rows:**
- Ingredient thumbnail, name, quantity, expiry date, food group
- **Native:** swipe left = mark expired, swipe right = remove
- **Web:** hover → ⋮ menu (same actions)
- Long-press → multi-select mode

**Expired tab:** Add to shopping list or remove from pantry.

**Modals/sheets:** Add item, edit item (name/qty/unit/expiry), scan bill (camera or upload, AI extraction).

---

### 6.4 Meals

**Header** changes by sub-tab:

| Sub-tab | Title | Subtitle |
|---------|-------|----------|
| Meal planning | Meal planning | *Meals shaped by your pantry* |
| History & diet | History & diet | *Your meals, day by day* |

**Segmented control** switches between the two sub-tabs.

#### Meal planning tab

| Section | Description |
|---------|-------------|
| **Week plan carousel** | Horizontal day picker (Mon–Sun). Tap a day → bottom sheet with breakfast/lunch/dinner, swap dishes, refresh day |
| **Prompt + meal type** | Free-text “what should I cook?” + dropdown (Lunch/Dinner, Breakfast, Snack, Dessert, Any) |
| **More ideas grid** | Category cards: Daily, **Rescue** (expiring items), Meal of Day, Healthy, Tasty, Meal Prep |

**Meal suggestions sheet** (opens from categories or prompt):
- Dish image, title, cook time, difficulty
- Ingredients with pantry match / “to buy”
- Actions: regenerate, add missing to shopping, send to cook

#### History & diet tab

- Chronological cooked-meal log (manual, WhatsApp-parsed, cook-reported)
- **Log meal** button + modal
- Diet analysis email toggle (premium)
- Notification tap opens this tab with log modal pre-opened

---

### 6.5 Cook communication

**Header title:** Cook Communication  
**Subtitle:** *Your cook, connected to the plan*

**Layout:**
- **Message composer** at top (WhatsApp-style send)
- Cook profile card: name, phone, message language
- Recent messages log (server-synced)
- **Dishes cook knows** — chips; tap to pre-fill composer

**First-time:** bottom sheet to set cook name, WhatsApp number, language (EN / HI / TA / etc.)

**Send flow:** Compose → opens WhatsApp (`wa.me`) → message logged on server.

Can receive `dishItems` from Meals (“Send to cook”) with main dish + pairings pre-filled.

---

### 6.6 Shopping list

**Header title:** Shopping List  
**Subtitle:** *Groceries shaped by your meal plan*

#### Suggested to order

- Collapsed header row: lightbulb icon · **Suggested to order (n)** · **Add all** (when 2+)
- **Horizontal row of up to 5 cards** (168px wide each; scroll on narrow screens)
- Each card:
  - **+** button top-right (tap whole card to add)
  - Ingredient thumbnail
  - Name and quantity on one line (`Name · 2 kg`)
- Suggestions come from meal plan + pantry; items already in pantry or on the list are hidden
- No manual refresh button — reloads on tab focus and pull-to-refresh

#### Your list

- Toolbar: Select · **+ Add** (manual item)
- Rows: thumbnail, name · qty, ⋮ menu (edit, mark purchased → inventory, remove)
- Multi-select bar: bulk add to inventory or remove (with undo)

**Optional:** Order online sheet when commerce partners are enabled server-side.

---

### 6.7 Profile (stack screen)

Opened from **profile avatar** on any main tab header. Back navigation returns to previous tab.

**Top stats:** inventory count · expiring count · memories count

**Three tabs:**

| Tab | Contents |
|-----|----------|
| **Settings** | Plan/subscription (Razorpay), shared kitchen (create/join/invite/leave), Google account info, app update check, **Sign out** |
| **Preferences** | Household size, spice, skill, dietary tags, cuisines, allergies, dislikes — feeds meal AI |
| **Memory** | Family food memories (preference / health / family / general) with add and delete |

Meal log reminder notifications are always on (no toggle in settings); they schedule at 1:30 PM and 8:00 PM on native.

---

## 7. Key features (behavior)

### AI meal planning

- **7-day week plan** with breakfast, lunch, dinner per day
- On-demand categories: daily idea, rescue (expiring stock), healthy, tasty, meal prep
- Custom prompt with meal-type filter
- Pantry-aware: shows what you have vs need to buy
- Realistic purchase quantities (e.g. 2 lemons, 1 kg rice — not “10 pcs”)

### Pantry intelligence

- Active, expiring-soon, and expired states
- Food-group classification and filters
- Bill scan (Google Vision + AI) with freemium daily limits
- Shared kitchen: multiple members, one inventory

### Smart shopping

- List persists across sessions
- AI **suggested to order** from upcoming planned meals
- One-tap add from suggestions or meal sheets
- Mark purchased → moves to inventory

### WhatsApp integration

| Flow | Platform | Behavior |
|------|----------|----------|
| Send to cook | All | Compose menu/list → WhatsApp → server log |
| Quick import | Native only | Share from WhatsApp → parse intent → apply (add shopping, log meal, mark OOS, etc.) |
| Daily menu API | Backend | Scheduled / on-demand cook messages |

### Rescue meals

- Meals tab → **Rescue** category
- AI prioritizes ingredients expiring soon
- Surfaces on Home via expiring-soon panel

### Meal log & diet

- Manual log from Home quick action or Meals history
- Sources tracked: manual, WhatsApp, cook
- Local reminders (native): lunch & dinner nudges
- Optional nightly diet analysis email (premium)

### Subscriptions & limits

- Free vs paid tiers gate bill scans, meal categories, etc.
- Razorpay checkout from Profile
- Force-update screen blocks outdated app versions

---

## 8. Shared UI patterns

### Headers

- **Home:** greeting hero only
- **Other tabs:** green `TabScreenHeader` with idea-focused subtitle (not action commands)
- **Profile:** stack header with back chevron

### Cards & lists

- White `Surface` cards, 14–20px radius, light border or elevation
- Ingredient thumbnails via `IngredientThumb` (staple image or apple placeholder)
- Undo snackbars after delete/remove (shopping & inventory)

### Bottom sheets

- Meal suggestions, week plan day detail, edit shopping/inventory item, cook profile, scan bill, order online

### Refresh model

- Pull-to-refresh on scrollable screens
- `AppRefreshContext` bumps version when data changes elsewhere (e.g. add from Meals → Shopping list reloads)

---

## 9. Web vs native differences

| Feature | Web | iOS / Android |
|---------|-----|----------------|
| Marketing landing | Yes (`/`) | No — login first |
| Google sign-in | GIS web button | Native Google Sign-In |
| URL routing | Full path sync | Deep links only |
| Inventory swipe | Hover ⋮ menu | Swipe gestures |
| WhatsApp quick import | Disabled | Share intent from WhatsApp |
| Meal log notifications | Not supported | 1:30 PM & 8:00 PM local |
| Bill scan | File upload | Camera + gallery |
| Cook send | `wa.me` link | Opens WhatsApp app |
| Session after deploy | Build ID may clear stale token | Same |

---

## 10. Data & backend (high level)

- **API:** Go REST service at `/api/v1`
- **Auth:** Google OAuth → session token
- **AI:** Gemini for meal suggestions, week plans, bill parsing, order suggestions
- **Storage:** PostgreSQL (users, inventory, shopping, meals, cook messages, kitchens)
- **Payments:** Razorpay (subscriptions)
- **Async:** Kafka for some background jobs

Frontend env: `EXPO_PUBLIC_API_BASE_URL`, Google client IDs per platform, optional `EXPO_PUBLIC_BUILD_ID`.

---

## 11. User journeys (quick reference)

### New user

Landing (web) → Login → Onboarding (prefs + staples) → Home → explore tabs

### Evening “what’s for dinner?”

Home Meal of Day → or Meals → Daily/Rescue → suggestion sheet → add missing to shopping → send to cook

### Weekly shop

Meals week plan set → Shopping **Suggested to order** → add all → shop → mark purchased on list → inventory updates

### Reduce waste

Home expiring soon → Meals Rescue → cook with expiring items → log meal in History

### Family with cook

Profile prefs → Cook tab setup → week plan → send daily menu on WhatsApp → cook reports via WhatsApp import (native)

---

## 12. File reference (frontend)

| Area | Path |
|------|------|
| Navigation | `src/navigation/AppNavigator.tsx`, `types.ts`, `webHomePath.ts` |
| Brand | `src/constants/brand.ts` |
| Theme | `src/theme/index.ts` |
| Screens | `src/screens/*.tsx` |
| Landing styles | `src/styles/landing.web.css` |
| Tab header | `src/components/TabScreenHeader.tsx` |

---

*Last updated: June 2026 — reflects current UI including marketing landing, shopping suggestion cards, and idea-focused tab subtitles.*
