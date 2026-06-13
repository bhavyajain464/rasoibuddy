-- Commerce Phase 0: log "order this list" intents from the household shopping flow.
-- Consumer-app only (household shopping_items / order-suggestions) — not the restaurant module.
-- Captures the click->order funnel so revenue can be attributed later via a free affiliate
-- network (subid = tracking_id), with zero rework when affiliate templates are switched on.

CREATE TABLE IF NOT EXISTS commerce_order_intents (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID REFERENCES users(user_id) ON DELETE SET NULL,
    kitchen_id    UUID REFERENCES kitchens(kitchen_id) ON DELETE SET NULL,
    partner       VARCHAR(64) NOT NULL,
    source        VARCHAR(32) NOT NULL DEFAULT 'shopping_list', -- shopping_list | order_suggest
    items         JSONB NOT NULL DEFAULT '[]',
    item_count    INTEGER NOT NULL DEFAULT 0,
    tracking_id   VARCHAR(64) NOT NULL UNIQUE,                  -- affiliate subid
    status        VARCHAR(16) NOT NULL DEFAULT 'clicked',       -- clicked | converted
    amount_paise  INTEGER,                                      -- filled by webhook (Phase 2)
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    converted_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_commerce_intents_user ON commerce_order_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_intents_partner ON commerce_order_intents(partner, created_at DESC);
