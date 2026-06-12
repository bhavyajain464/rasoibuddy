# Commerce — "Order this list online" (Phase 0)

A **free, no-partnership** grocery-ordering surface on the **consumer household app**
(shopping list). It lets a user open their list in a quick-commerce app and copies the
list to the clipboard so they can paste-and-search. Every tap is logged so commission can
be turned on later via config — with **zero code change**.

> Scope: consumer/household app only (`shopping_items`, `ShoppingScreen`). The restaurant
> module (`internal/restaurant/**`) is **not** involved.

---

## Why this exists (the monetization thesis)
Indian consumers rarely pay subscriptions for a utility app, but they *transact* on
groceries constantly. The shopping list is a high-intent surface, so we monetize the
**order** rather than the app. Phase 0 ships the surface for free and makes it
revenue-ready.

**Honest constraints:**
- Indian quick-commerce apps (Blinkit/Zepto/Instamart/BigBasket/JioMart) do **not** expose
  a public "pre-fill my cart" deep-link, and they only search one term at a time. So the
  flow is: pick a store, then open a **search per product** (one tap per item), with a
  "copy whole list" fallback to paste into search.
- Direct partnerships need traction. Until then, "free" earning = joining a **free affiliate
  network** (EarnKaro / Cuelinks / Amazon Associates). Blinkit/Zepto specifically may not be
  available on those networks; BigBasket / Amazon Fresh / JioMart are more likely.

## Phasing
| Phase | Needs | User gets | Revenue |
|-------|-------|-----------|---------|
| **0 (this PR)** | nothing | Open app + list copied to clipboard | none yet (or affiliate if a template is set) |
| 1 | partner search URLs | per-item search deep-links | affiliate, better attribution |
| 2 | partner API + SKU map | true cart-fill + conversion webhooks | commission per confirmed order |

---

## How it works

```
ShoppingScreen ──tap "Order this list online"──▶ OrderOnlineSheet (partner picker)
        │
        ▼  POST /api/v1/commerce/order-link { partner, items, source }
   handlers.CreateOrderLink
        ├─ services.BuildOrderLink(partner, items, trackingId)   → url + copy_text
        ├─ services.RecordOrderIntent(...)  → commerce_order_intents (best-effort)
        └─ returns { url, copy_text, tracking_id }
        │
        ▼  client copies copy_text, then opens url (Linking / window.open)
```

### Link building (`services/commerce.go`)
- Target = partner `SearchURL` with the first item as `{query}`, else the partner home
  `DeepLink`.
- If the partner has an `AffiliateTemplate`, the target is wrapped:
  `{target}` → url-encoded link, `{subid}` → our `tracking_id`. Blank template → plain link.
- `copy_text` renders the full list as `"2 kg Onion\n1 L Milk"` for paste-into-search.

### Attribution (`commerce_order_intents`)
Each click inserts a row (`user_id, kitchen_id, partner, items, tracking_id, status`).
`tracking_id` is the affiliate `subid`. Phase 1 reconciles from the network's report; Phase 2
adds a conversion webhook to set `status='converted'` and `amount_paise`.

---

## API

### `GET /api/v1/commerce/partners` (auth)
```json
{ "enabled": true, "partners": [ { "id": "blinkit", "name": "Blinkit", "eta": "10-20 min" } ] }
```
When `COMMERCE_ENABLED=false`, returns `{ "enabled": false, "partners": [] }` and the client
hides the surface.

### `POST /api/v1/commerce/order-link` (auth)
Request:
```json
{ "partner": "blinkit", "source": "shopping_list",
  "items": [ { "name": "Onion", "qty": 2, "unit": "kg" } ] }
```
Response:
```json
{ "partner": "blinkit", "url": "https://blinkit.com/s/?q=Onion",
  "tracking_id": "tid…", "copy_text": "2 kg Onion" }
```

---

## Configuration (env)
| Var | Default | Purpose |
|-----|---------|---------|
| `COMMERCE_ENABLED` | `false` | Master switch; surface hidden client-side when off. |
| `COMMERCE_DISABLED_PARTNERS` | _empty_ | Comma list to hide partners, e.g. `zepto,jiomart`. |
| `COMMERCE_AFFILIATE_<ID>` | _empty_ | Affiliate template per partner (`{target}`,`{subid}`). **Set this to start earning** — no code change. |

Built-in partners: `blinkit`, `zepto`, `instamart`, `bigbasket`, `jiomart`.

### Turning on revenue later
1. Join a free affiliate network and get your tracking-link template.
2. Set e.g. `COMMERCE_AFFILIATE_BIGBASKET=https://track.cuelinks.com/…?url={target}&subid={subid}`.
3. Done — links become commission-tracked; reconcile conversions by `subid`.

---

## Files
- `backend/pkg/config/commerce.go` — partner registry + env loader
- `backend/internal/services/commerce.go` — link/copy/tracking-id logic (+ `commerce_test.go`)
- `backend/internal/services/commerce_store.go` — intent persistence
- `backend/internal/handlers/commerce.go` — `partners` + `order-link` endpoints
- `backend/migrations/033_commerce_order_intents.sql`
- `frontend/.../services/api.ts` — `getCommercePartners`, `createOrderLink`
- `frontend/.../components/OrderOnlineSheet.tsx` — partner picker
- `frontend/.../screens/ShoppingScreen.tsx` — CTA

## Rollout / safety
- Defaults **off**; ship dark, enable when ready.
- Intent logging is best-effort and never blocks returning the link.
- No PII leaves the app; only item names are passed to the partner via search/clipboard.
