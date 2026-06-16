-- pairs_with shorthand labels (e.g. "roti", "tea") resolve to registered dish or ingredient ids.
-- Managed at runtime via admin API; bootstrapped from built-in defaults on first run.

CREATE TABLE IF NOT EXISTS pair_label_aliases (
    label       TEXT PRIMARY KEY,
    target_kind TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_pair_alias_kind CHECK (target_kind IN ('dish', 'ingredient'))
);

CREATE INDEX IF NOT EXISTS ix_pair_alias_target ON pair_label_aliases (target_kind, target_id);
