-- Dish families group near-duplicate catalog rows for meal-plan diversity and
-- ingredient-based variant resolution (e.g. moong vs toor dal tadka).
ALTER TABLE dishes
    ADD COLUMN IF NOT EXISTS dish_family TEXT,
    ADD COLUMN IF NOT EXISTS variant_style TEXT;

-- Self-family default until catalog reseed fills explicit groups.
UPDATE dishes
SET dish_family = id
WHERE dish_family IS NULL OR TRIM(dish_family) = '';

CREATE INDEX IF NOT EXISTS ix_dishes_family ON dishes (dish_family);
CREATE INDEX IF NOT EXISTS ix_dishes_family_style ON dishes (dish_family, variant_style);
