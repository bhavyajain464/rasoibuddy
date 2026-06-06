-- Restaurant platform: kitchen kinds/roles, menu, orders, inventory movements.

-- kitchens: household vs restaurant + B2B plan on kitchen row
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'household';
ALTER TABLE kitchens ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kitchens_kind_check'
  ) THEN
    ALTER TABLE kitchens ADD CONSTRAINT kitchens_kind_check
      CHECK (kind IN ('household', 'restaurant'));
  END IF;
END $$;

-- kitchen_members: roles; allow multiple kitchens per user
ALTER TABLE kitchen_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_members_role_check'
  ) THEN
    ALTER TABLE kitchen_members ADD CONSTRAINT kitchen_members_role_check
      CHECK (role IN ('owner', 'manager', 'staff', 'member'));
  END IF;
END $$;

ALTER TABLE kitchen_members DROP CONSTRAINT IF EXISTS kitchen_members_user_id_key;

-- Backfill roles: kitchen creator is owner, others member
UPDATE kitchen_members km
SET role = 'owner'
FROM kitchens k
WHERE km.kitchen_id = k.kitchen_id
  AND k.created_by IS NOT NULL
  AND km.user_id = k.created_by
  AND km.role = 'member';

CREATE INDEX IF NOT EXISTS idx_kitchens_kind ON kitchens(kind);
CREATE INDEX IF NOT EXISTS idx_kitchen_members_role ON kitchen_members(kitchen_id, role);

-- Menu & recipes (kitchen-scoped)
CREATE TABLE IF NOT EXISTS menu_items (
    menu_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'general',
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_menu_items_kitchen ON menu_items(kitchen_id);

CREATE TABLE IF NOT EXISTS recipes (
    recipe_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL UNIQUE REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recipes_kitchen ON recipes(kitchen_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    ingredient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    ingredient_name VARCHAR(255) NOT NULL,
    qty NUMERIC(12, 4) NOT NULL CHECK (qty > 0),
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    waste_factor NUMERIC(5, 4) NOT NULL DEFAULT 1.0 CHECK (waste_factor > 0),
    inventory_item_id UUID REFERENCES inventory(item_id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- Orders
CREATE TABLE IF NOT EXISTS restaurant_orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'completed', 'void')),
    source VARCHAR(20) NOT NULL DEFAULT 'pos'
      CHECK (source IN ('pos', 'import', 'aggregator')),
    total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    completed_at TIMESTAMP WITH TIME ZONE,
    voided_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_kitchen ON restaurant_orders(kitchen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_status ON restaurant_orders(kitchen_id, status);

CREATE TABLE IF NOT EXISTS restaurant_order_lines (
    line_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES restaurant_orders(order_id) ON DELETE CASCADE,
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id) ON DELETE RESTRICT,
    menu_item_name VARCHAR(255) NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (line_total_cents >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_restaurant_order_lines_order ON restaurant_order_lines(order_id);

-- Inventory audit ledger
CREATE TABLE IF NOT EXISTS inventory_movements (
    movement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory(item_id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    order_id UUID REFERENCES restaurant_orders(order_id) ON DELETE SET NULL,
    delta_qty NUMERIC(12, 4) NOT NULL,
    reason VARCHAR(50) NOT NULL
      CHECK (reason IN ('order_deduct', 'adjust', 'void_reversal', 'receive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_kitchen ON inventory_movements(kitchen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id);

-- Cross-restaurant intelligence (opt-in aggregates) — schema only for future tier
CREATE TABLE IF NOT EXISTS analytics_restaurant_opt_in (
    kitchen_id UUID PRIMARY KEY REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    opted_in_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    opted_in_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analytics_daily_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_date DATE NOT NULL,
    food_group VARCHAR(50) NOT NULL,
    total_delta_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usage_date, food_group)
);
