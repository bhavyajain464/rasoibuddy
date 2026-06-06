-- Zomato sync is per-outlet; partner auth is shared per kitchen.

CREATE TABLE IF NOT EXISTS zomato_kitchen_auth (
    kitchen_id UUID PRIMARY KEY REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    auth_json JSONB NOT NULL,
    auth_refreshed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zomato_outlet_sync (
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    outlet_id VARCHAR(32) NOT NULL,
    outlet_name VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'idle'
      CHECK (status IN ('idle', 'running', 'error', 'login_required')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    last_sync_message TEXT,
    orders_imported_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_imported_count >= 0),
    actor_user_id UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kitchen_id, outlet_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_zomato_outlet_sync_outlet_id
    ON zomato_outlet_sync(outlet_id);

INSERT INTO zomato_kitchen_auth (kitchen_id, auth_json, auth_refreshed_at, updated_at)
SELECT kitchen_id, auth_json, auth_refreshed_at, updated_at
FROM zomato_kitchen_sync
WHERE auth_json IS NOT NULL
ON CONFLICT (kitchen_id) DO UPDATE SET
    auth_json = EXCLUDED.auth_json,
    auth_refreshed_at = EXCLUDED.auth_refreshed_at,
    updated_at = EXCLUDED.updated_at;

INSERT INTO zomato_outlet_sync (
    kitchen_id, outlet_id, outlet_name, status, last_sync_at, last_error,
    last_sync_message, orders_imported_count, actor_user_id, updated_at
)
SELECT
    kitchen_id, outlet_id, outlet_name, status, last_sync_at, last_error,
    last_sync_message, orders_imported_count, actor_user_id, updated_at
FROM zomato_kitchen_sync
WHERE outlet_id IS NOT NULL AND outlet_id <> ''
ON CONFLICT (kitchen_id, outlet_id) DO NOTHING;

-- Keep legacy table for rollback / old deploys. New code reads outlet_partner_* tables above.
-- DROP intentionally omitted for production safety.
