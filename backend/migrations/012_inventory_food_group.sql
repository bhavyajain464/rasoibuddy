-- Inventory food groups for filtering (vegetables, spices, etc.)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS food_group VARCHAR(32) NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_inventory_food_group ON inventory(user_id, food_group);
