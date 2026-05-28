# Database migrations

SQL files are applied **manually** (the API does not run them). Run in numeric order on a fresh or existing Postgres database.

## Fresh database

```bash
createdb kitchenai   # or use Supabase / DATABASE_URL target
./backend/migrations/apply_all.sh kitchenai
```

Or apply each file:

```bash
psql -d kitchenai -f backend/migrations/000_baseline.sql
psql -d kitchenai -f backend/migrations/001_user_scope.sql
psql -d kitchenai -f backend/migrations/002_profile_and_shopping.sql
psql -d kitchenai -f backend/migrations/003_cooked_log.sql
psql -d kitchenai -f backend/migrations/004_dish_global_stars.sql
psql -d kitchenai -f backend/migrations/005_user_entitlements.sql
psql -d kitchenai -f backend/migrations/006_razorpay_orders.sql
psql -d kitchenai -f backend/migrations/007_subscription_plans.sql
```

## Existing database

If you already ran the old `database/schema.sql` and partial migrations, only run files you have not applied yet (all use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible).

| File | Purpose |
|------|---------|
| `000_baseline.sql` | Core tables (users, inventory, prefs, cook profile, sessions, …) |
| `001_user_scope.sql` | `user_id` on inventory, cook_profile, shopping_list |
| `002_profile_and_shopping.sql` | Onboarding prefs, `user_memory`, `shopping_items` |
| `003_cooked_log.sql` | Cook history |
| `004_dish_global_stars.sql` | Global dish star counts |
| `005_user_entitlements.sql` | Freemium `plan` and `bill_scan_count` on users |
| `006_razorpay_orders.sql` | Razorpay premium checkout order tracking |
| `007_subscription_plans.sql` | Pro/Elite tiers, monthly/yearly expiry on users |
| `008_order_proration.sql` | Upgrade credit + list price on `razorpay_orders` |
| `009_normalize_plan_column.sql` | Sync `users.plan` with `plan_tier` (drop legacy `premium`) |
| `010_diet_analysis_email.sql` | Nightly diet digest email opt-in on users |
| `011_bill_scan_daily.sql` | Daily bill scan reset date (`bill_scan_count_date`) |

Grant Pro for testing:

```sql
UPDATE users
SET plan_tier = 'pro', plan_interval = 'yearly', plan = 'pro',
    plan_expires_at = NOW() + INTERVAL '1 year'
WHERE email = 'you@example.com';
```
