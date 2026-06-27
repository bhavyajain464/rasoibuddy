-- Household catalog cooking instructions (distinct from restaurant recipe_ingredients BOM).
CREATE TABLE IF NOT EXISTS dish_recipes (
    dish_id            TEXT PRIMARY KEY REFERENCES dishes(id) ON DELETE CASCADE,
    source             TEXT NOT NULL DEFAULT 'rasoibuddy.in',
    source_url         TEXT,
    source_recipe_id   TEXT,
    title              TEXT NOT NULL,
    description        TEXT,
    prep_time_minutes  INT,
    cook_time_minutes  INT,
    total_time_minutes INT,
    yield              TEXT,
    ingredients        TEXT[] NOT NULL DEFAULT '{}',
    instructions       JSONB NOT NULL DEFAULT '[]',
    images             TEXT[] NOT NULL DEFAULT '{}',
    nutrition          JSONB,
    match_method       TEXT NOT NULL DEFAULT 'exact_slug',
    verified           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_dish_recipes_source ON dish_recipes (source);
CREATE INDEX IF NOT EXISTS ix_dish_recipes_match ON dish_recipes (match_method);
