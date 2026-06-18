-- Link restaurant menu rows to global dish catalog photos (CDN URLs).

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS catalog_dish_id VARCHAR(120);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_menu_items_catalog_dish
  ON menu_items(catalog_dish_id)
  WHERE catalog_dish_id IS NOT NULL AND catalog_dish_id <> '';
