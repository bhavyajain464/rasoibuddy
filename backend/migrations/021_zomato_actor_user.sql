-- Persist actor who started Zomato sync (for order ingest on API restart).

ALTER TABLE zomato_kitchen_sync
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(user_id);
