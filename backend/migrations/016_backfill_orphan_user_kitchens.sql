-- Users created after 014_shared_kitchens.sql may lack kitchen_members if signup
-- ran before ensureUserKitchen was deployed. Idempotent backfill (same pattern as 014).

WITH existing_members AS (
    SELECT DISTINCT user_id FROM kitchen_members
),
orphan_users AS (
    SELECT u.user_id, u.name
    FROM users u
    LEFT JOIN existing_members em ON em.user_id = u.user_id
    WHERE em.user_id IS NULL
)
INSERT INTO kitchens (name, invite_code, created_by)
SELECT
    COALESCE(NULLIF(TRIM(ou.name), ''), 'My') || '''s Kitchen',
    UPPER(SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text || ou.user_id::text) FROM 1 FOR 8)),
    ou.user_id
FROM orphan_users ou;

INSERT INTO kitchen_members (kitchen_id, user_id)
SELECT k.kitchen_id, k.created_by
FROM kitchens k
WHERE k.created_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM kitchen_members km WHERE km.user_id = k.created_by)
ON CONFLICT (user_id) DO NOTHING;

UPDATE inventory i
SET kitchen_id = km.kitchen_id
FROM kitchen_members km
WHERE i.user_id = km.user_id
  AND i.kitchen_id IS NULL;
