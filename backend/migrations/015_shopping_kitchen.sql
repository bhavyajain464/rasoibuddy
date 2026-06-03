-- Scope shopping_items to kitchen (shared list for all kitchen members).

ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS kitchen_id UUID REFERENCES kitchens(kitchen_id) ON DELETE CASCADE;

UPDATE shopping_items si
SET kitchen_id = km.kitchen_id
FROM kitchen_members km
WHERE si.user_id = km.user_id
  AND si.kitchen_id IS NULL;

ALTER TABLE shopping_items ALTER COLUMN kitchen_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_items_kitchen ON shopping_items(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_kitchen_active ON shopping_items(kitchen_id) WHERE bought = FALSE;
