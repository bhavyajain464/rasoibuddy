-- Global restaurant ingredient catalog + outlet requests for new items.

CREATE TABLE IF NOT EXISTS restaurant_ingredients (
    ingredient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_normalized VARCHAR(255) NOT NULL UNIQUE,
    default_unit VARCHAR(20) NOT NULL DEFAULT 'g',
    food_group VARCHAR(50) NOT NULL DEFAULT 'other',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_restaurant_ingredients_name ON restaurant_ingredients(name_normalized);

CREATE TABLE IF NOT EXISTS restaurant_ingredient_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    requested_name VARCHAR(255) NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT restaurant_ingredient_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_restaurant_ingredient_requests_kitchen
    ON restaurant_ingredient_requests(kitchen_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_ingredient_requests_pending
    ON restaurant_ingredient_requests(status, created_at DESC)
    WHERE status = 'pending';

-- Seed from existing recipe + stock names (restaurant kitchens only).
INSERT INTO restaurant_ingredients (name, name_normalized, default_unit, food_group)
SELECT DISTINCT ON (norm)
    INITCAP(TRIM(src.name)) AS name,
    norm,
    COALESCE(NULLIF(TRIM(src.unit), ''), 'g') AS default_unit,
    COALESCE(NULLIF(TRIM(src.food_group), ''), 'other') AS food_group
FROM (
    SELECT ri.ingredient_name AS name, ri.unit, 'other' AS food_group
    FROM recipe_ingredients ri
    JOIN kitchens k ON k.kitchen_id = ri.kitchen_id AND k.kind = 'restaurant'
    UNION
    SELECT i.canonical_name, i.unit, COALESCE(i.food_group, 'other')
    FROM inventory i
    JOIN kitchens k ON k.kitchen_id = i.kitchen_id AND k.kind = 'restaurant'
) src
CROSS JOIN LATERAL (SELECT LOWER(TRIM(src.name)) AS norm) n
WHERE norm <> ''
ORDER BY norm, LENGTH(TRIM(src.name))
ON CONFLICT (name_normalized) DO NOTHING;

-- Starter staples when DB is empty.
INSERT INTO restaurant_ingredients (name, name_normalized, default_unit, food_group)
SELECT v.name, LOWER(v.name), v.unit, v.food_group
FROM (VALUES
    ('Onion', 'kg', 'vegetables'),
    ('Tomato', 'kg', 'vegetables'),
    ('Ginger', 'g', 'vegetables'),
    ('Garlic', 'g', 'vegetables'),
    ('Green chilli', 'g', 'vegetables'),
    ('Potato', 'kg', 'vegetables'),
    ('Paneer', 'kg', 'dairy'),
    ('Curd', 'kg', 'dairy'),
    ('Milk', 'l', 'dairy'),
    ('Butter', 'g', 'dairy'),
    ('Cream', 'ml', 'dairy'),
    ('Toor dal', 'kg', 'grains_pulses'),
    ('Chana dal', 'kg', 'grains_pulses'),
    ('Moong dal', 'kg', 'grains_pulses'),
    ('Basmati rice', 'kg', 'grains_pulses'),
    ('Cooking oil', 'l', 'oils_fats'),
    ('Ghee', 'kg', 'oils_fats'),
    ('Turmeric powder', 'g', 'spices'),
    ('Red chilli powder', 'g', 'spices'),
    ('Coriander powder', 'g', 'spices'),
    ('Garam masala', 'g', 'spices'),
    ('Cumin seeds', 'g', 'spices'),
    ('Salt', 'g', 'spices'),
    ('Sugar', 'kg', 'other'),
    ('Cashew', 'g', 'other'),
    ('Cashew nut', 'g', 'other')
) AS v(name, unit, food_group)
ON CONFLICT (name_normalized) DO NOTHING;
