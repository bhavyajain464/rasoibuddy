-- Zomato partner sync: external order dedup + sync status per kitchen.

CREATE TABLE IF NOT EXISTS zomato_kitchen_sync (
    kitchen_id UUID PRIMARY KEY REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'idle'
      CHECK (status IN ('idle', 'running', 'error', 'login_required')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    orders_imported_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_imported_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zomato_external_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    external_order_id VARCHAR(128) NOT NULL,
    order_id UUID NOT NULL REFERENCES restaurant_orders(order_id) ON DELETE CASCADE,
    raw_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (kitchen_id, external_order_id)
);
CREATE INDEX IF NOT EXISTS idx_zomato_external_orders_kitchen ON zomato_external_orders(kitchen_id, created_at DESC);
