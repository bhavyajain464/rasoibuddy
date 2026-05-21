-- Nightly diet digest email (Elite feature).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS diet_analysis_email_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS diet_analysis_last_sent_date DATE;
