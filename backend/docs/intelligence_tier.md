# Cross-restaurant intelligence tier

Opt-in aggregate analytics for restaurant kitchens on the **enterprise** plan.

## Tables

- `analytics_restaurant_opt_in` — per-kitchen consent (`POST /restaurant/{id}/analytics/opt-in`)
- `analytics_daily_usage` — anonymized daily rollups by `food_group` (no kitchen_id stored)

## Pipeline

1. Nightly job calls `AnalyticsService.AggregateDailyUsage(day)` for opted-in kitchens only.
2. Aggregates sum `ABS(delta_qty)` from `inventory_movements` where `reason = order_deduct`.
3. `GET /restaurant/{id}/analytics/benchmarks?food_group=vegetables` returns 30-day averages when:
   - Kitchen `plan_tier` includes `intelligence` feature (enterprise)
   - Kitchen has opted in

## Privacy

- No cross-tenant raw reads at request time.
- Benchmarks use `analytics_daily_usage` only — no PII, no per-restaurant identifiers in aggregate tables.

## Future

- Demand forecasting from order history
- Menu engineering (margin vs BOM cost)
- Separate billing SKU for intelligence add-on
