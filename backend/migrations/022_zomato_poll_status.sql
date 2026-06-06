-- Per-poll sync feedback for Zomato integration UI.

ALTER TABLE zomato_kitchen_sync
    ADD COLUMN IF NOT EXISTS last_sync_message TEXT;
