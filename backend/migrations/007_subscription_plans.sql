-- Multi-tier subscriptions: pro / elite with monthly or yearly expiry.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_interval TEXT;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;

UPDATE users
SET plan_tier = 'pro',
    plan_interval = COALESCE(plan_interval, 'yearly'),
    plan_expires_at = COALESCE(plan_expires_at, NOW() + INTERVAL '10 years')
WHERE plan = 'premium' AND plan_tier = 'free';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_tier_check;
ALTER TABLE users ADD CONSTRAINT users_plan_tier_check
    CHECK (plan_tier IN ('free', 'pro', 'elite'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_interval_check;
ALTER TABLE users ADD CONSTRAINT users_plan_interval_check
    CHECK (plan_interval IS NULL OR plan_interval IN ('monthly', 'yearly'));

ALTER TABLE razorpay_orders
    ADD COLUMN IF NOT EXISTS plan_tier TEXT;

ALTER TABLE razorpay_orders
    ADD COLUMN IF NOT EXISTS plan_interval TEXT;
