-- Align legacy users.plan with plan_tier (drop "premium" naming).

UPDATE users
SET plan = plan_tier
WHERE plan IS DISTINCT FROM plan_tier
   OR LOWER(plan) = 'premium';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ADD CONSTRAINT users_plan_check
    CHECK (plan IN ('free', 'pro', 'elite'));
