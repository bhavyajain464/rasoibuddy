-- Store Zomato partner auth + outlet per kitchen (API-based sync).

ALTER TABLE zomato_kitchen_sync
  ADD COLUMN IF NOT EXISTS outlet_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS outlet_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS auth_json JSONB,
  ADD COLUMN IF NOT EXISTS auth_refreshed_at TIMESTAMP WITH TIME ZONE;
