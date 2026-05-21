-- Freemium: plan tier and bill scan usage (camera + upload share one counter).
-- (Part of backend/migrations; apply after 004.)

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'premium'));

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bill_scan_count INT NOT NULL DEFAULT 0
        CHECK (bill_scan_count >= 0);
