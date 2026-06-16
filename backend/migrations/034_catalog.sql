-- Catalog: ingredients, dishes, their aliases/metadata, and the dish<->ingredient graph.
-- Moves the embedded JSON catalogs into Postgres so name-matching is a keyed lookup,
-- not string contains(). Hard rule: nothing un-registered may exist —
--   * every dish recipe line references a real ingredient (FK + RESTRICT),
--   * every user inventory/shopping row references a real ingredient,
--   * suggestible content references real, verified catalog rows.
-- Unmatched user/scan input is parked in ingredient_candidates, never silently inserted.

CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy / typo-tolerant name match
CREATE EXTENSION IF NOT EXISTS unaccent;   -- diacritic-insensitive normalization

-- ─────────────────────────────────────────────────────────────────────────────
-- INGREDIENTS  (reference data; slug PK is stable across reseeds and readable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
    id             TEXT PRIMARY KEY,                                   -- 'red_chilli_powder'
    canonical_name TEXT NOT NULL,                                      -- 'Red Chilli Powder'
    category       TEXT NOT NULL,
    veg            BOOLEAN NOT NULL DEFAULT TRUE,
    default_unit   TEXT NOT NULL,
    units          TEXT[] NOT NULL DEFAULT '{}',                       -- allowed buy/store units
    restock_class  TEXT NOT NULL DEFAULT 'occasional',                 -- staple|frequent|regional|occasional
    default_pantry BOOLEAN NOT NULL DEFAULT FALSE,                     -- auto-seed at onboarding
    verified       BOOLEAN NOT NULL DEFAULT TRUE,                      -- false = auto-created, needs review
    metadata       JSONB NOT NULL DEFAULT '{}',                        -- image_url, shelf_life_days, nutrition…
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_ing_unit  CHECK (default_unit IN ('pcs','kg','g','L','ml')),
    CONSTRAINT ck_ing_restock CHECK (restock_class IN ('staple','frequent','regional','occasional'))
);
CREATE INDEX IF NOT EXISTS ix_ing_category ON ingredients (category);
CREATE INDEX IF NOT EXISTS ix_ing_pantry   ON ingredients (default_pantry) WHERE default_pantry;

-- ─────────────────────────────────────────────────────────────────────────────
-- INGREDIENT ALIASES  (the "many names" solution — resolve any string to one id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredient_aliases (
    id            BIGSERIAL PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    alias         TEXT NOT NULL,                                       -- display form: 'kothmir'
    normalized    TEXT NOT NULL,                                       -- lower(unaccent(trim)) for lookup
    is_primary    BOOLEAN NOT NULL DEFAULT FALSE,                      -- the canonical alias
    is_ambiguous  BOOLEAN NOT NULL DEFAULT FALSE,                      -- maps to >1 ingredient (e.g. 'kanda')
    lang          TEXT                                                 -- 'en','hi','ta'… (optional)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_alias_norm_ing ON ingredient_aliases (normalized, ingredient_id);
CREATE INDEX IF NOT EXISTS ix_alias_norm  ON ingredient_aliases (normalized);
CREATE INDEX IF NOT EXISTS ix_alias_trgm  ON ingredient_aliases USING gin (normalized gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- DISHES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dishes (
    id                TEXT PRIMARY KEY,                                -- 'palak-paneer'
    name              TEXT NOT NULL,
    display_name      TEXT,
    cuisine           TEXT,
    diet              TEXT,
    meal_type         TEXT[] NOT NULL DEFAULT '{}',
    tags              TEXT[] NOT NULL DEFAULT '{}',
    effort            TEXT,
    cook_time_minutes INT,
    weekday_friendly  BOOLEAN NOT NULL DEFAULT FALSE,
    one_pot           BOOLEAN NOT NULL DEFAULT FALSE,
    frequency_class   TEXT,
    half_life_days    INT,
    spice_level       TEXT,
    healthy_score     INT,
    tasty_score       INT,
    jain_safe         BOOLEAN NOT NULL DEFAULT FALSE,
    allergens         TEXT[] NOT NULL DEFAULT '{}',
    pairs_with        TEXT[] NOT NULL DEFAULT '{}',
    verified          BOOLEAN NOT NULL DEFAULT TRUE,
    metadata          JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_dish_diet   CHECK (diet IS NULL OR diet IN ('vegan','vegetarian','eggetarian','non-veg')),
    CONSTRAINT ck_dish_effort CHECK (effort IS NULL OR effort IN ('low','medium','high')),
    CONSTRAINT ck_dish_spice  CHECK (spice_level IS NULL OR spice_level IN ('mild','medium','spicy')),
    CONSTRAINT ck_dish_freq   CHECK (frequency_class IS NULL OR frequency_class IN ('daily','weekly','special')),
    CONSTRAINT ck_dish_health CHECK (healthy_score IS NULL OR (healthy_score BETWEEN 0 AND 100)),
    CONSTRAINT ck_dish_tasty  CHECK (tasty_score   IS NULL OR (tasty_score   BETWEEN 0 AND 100))
);
CREATE INDEX IF NOT EXISTS ix_dishes_mealtype ON dishes USING gin (meal_type);
CREATE INDEX IF NOT EXISTS ix_dishes_tags     ON dishes USING gin (tags);
CREATE INDEX IF NOT EXISTS ix_dishes_diet     ON dishes (diet);
CREATE INDEX IF NOT EXISTS ix_dishes_verified ON dishes (verified) WHERE verified;

-- ─────────────────────────────────────────────────────────────────────────────
-- DISH ↔ INGREDIENT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dish_ingredients (
    dish_id       TEXT NOT NULL REFERENCES dishes(id)      ON DELETE CASCADE,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    qty           NUMERIC,
    unit          TEXT,
    role          TEXT NOT NULL DEFAULT 'main',
    is_optional   BOOLEAN NOT NULL DEFAULT FALSE,
    is_staple     BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (dish_id, ingredient_id),
    CONSTRAINT ck_di_role CHECK (role IN ('main','aromatic','spice','tempering','garnish','other'))
);
CREATE INDEX IF NOT EXISTS ix_di_ingredient ON dish_ingredients (ingredient_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- INGREDIENT CANDIDATES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredient_candidates (
    id            BIGSERIAL PRIMARY KEY,
    raw_name      TEXT NOT NULL,
    normalized    TEXT NOT NULL,
    source        TEXT,
    hits          INT NOT NULL DEFAULT 1,
    suggested_id  TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_cand_status CHECK (status IN ('pending','registered','rejected','merged'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cand_norm ON ingredient_candidates (normalized);

-- ─────────────────────────────────────────────────────────────────────────────
-- LINK USER DATA TO THE CATALOG
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE inventory      ADD COLUMN IF NOT EXISTS ingredient_id TEXT REFERENCES ingredients(id);
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS ingredient_id TEXT REFERENCES ingredients(id);
CREATE INDEX IF NOT EXISTS ix_inventory_ingredient ON inventory (ingredient_id);
CREATE INDEX IF NOT EXISTS ix_shopping_ingredient  ON shopping_items (ingredient_id);

ALTER TABLE cooked_log ADD COLUMN IF NOT EXISTS dish_id TEXT REFERENCES dishes(id);
CREATE INDEX IF NOT EXISTS ix_cooked_dish ON cooked_log (dish_id);
