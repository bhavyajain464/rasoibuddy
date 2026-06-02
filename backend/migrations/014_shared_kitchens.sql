-- Shared kitchens v1 (inventory-only sharing, invite code join, one kitchen per user).

CREATE TABLE IF NOT EXISTS kitchens (
    kitchen_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL DEFAULT 'My Kitchen',
    invite_code VARCHAR(12) NOT NULL UNIQUE,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kitchen_members (
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kitchen_id, user_id),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_members_kitchen ON kitchen_members(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_kitchens_created_by ON kitchens(created_by);

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS kitchen_id UUID REFERENCES kitchens(kitchen_id) ON DELETE CASCADE;

-- One personal kitchen per existing user (if not already present).
WITH existing_members AS (
    SELECT DISTINCT user_id FROM kitchen_members
)
INSERT INTO kitchens (name, invite_code, created_by)
SELECT
    COALESCE(NULLIF(TRIM(u.name), ''), 'My') || '''s Kitchen',
    UPPER(SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text || u.user_id::text) FROM 1 FOR 8)),
    u.user_id
FROM users u
LEFT JOIN existing_members em ON em.user_id = u.user_id
WHERE em.user_id IS NULL;

-- Ensure each user is a member of their own created kitchen.
INSERT INTO kitchen_members (kitchen_id, user_id)
SELECT k.kitchen_id, k.created_by
FROM kitchens k
WHERE k.created_by IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Backfill inventory rows owned by users into those users' kitchens.
UPDATE inventory i
SET kitchen_id = km.kitchen_id
FROM kitchen_members km
WHERE i.user_id = km.user_id
  AND i.kitchen_id IS NULL;

-- Legacy rows with no user_id: attach to one fallback kitchen so kitchen_id can be non-null.
INSERT INTO kitchens (name, invite_code, created_by)
SELECT
    'Legacy Kitchen',
    UPPER(SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text || 'legacy-kitchen') FROM 1 FOR 8)),
    NULL
WHERE EXISTS (
    SELECT 1
    FROM inventory
    WHERE kitchen_id IS NULL
)
AND NOT EXISTS (
    SELECT 1
    FROM kitchens
    WHERE name = 'Legacy Kitchen' AND created_by IS NULL
);

UPDATE inventory
SET kitchen_id = (
    SELECT kitchen_id
    FROM kitchens
    WHERE name = 'Legacy Kitchen' AND created_by IS NULL
    ORDER BY created_at ASC
    LIMIT 1
)
WHERE kitchen_id IS NULL;

ALTER TABLE inventory ALTER COLUMN kitchen_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_kitchen ON inventory(kitchen_id);

