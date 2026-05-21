-- Per-user scoping for inventory, cook profile, and legacy shopping_list.

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE cook_profile ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_cook_profile_user ON cook_profile(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_user ON shopping_list(user_id);
