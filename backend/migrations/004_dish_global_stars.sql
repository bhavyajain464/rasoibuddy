-- Global dish stars: each user may star a dish once; star_count is aggregated across all users.

CREATE TABLE IF NOT EXISTS dish_star_counts (
    dish_name TEXT PRIMARY KEY,
    star_count INT NOT NULL DEFAULT 0 CHECK (star_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dish_user_stars (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    dish_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, dish_name)
);

CREATE INDEX IF NOT EXISTS idx_dish_user_stars_user ON dish_user_stars (user_id);
