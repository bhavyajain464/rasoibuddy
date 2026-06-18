-- catalog_dish_id was misnamed; stores Zomato partner catalogue id, not KitchenAI dish catalog.
ALTER TABLE menu_items RENAME COLUMN catalog_dish_id TO zomato_catalogue_id;

DROP INDEX IF EXISTS idx_menu_items_catalog_dish;
CREATE INDEX IF NOT EXISTS idx_menu_items_zomato_catalogue
  ON menu_items(zomato_catalogue_id)
  WHERE zomato_catalogue_id IS NOT NULL AND zomato_catalogue_id <> '';
