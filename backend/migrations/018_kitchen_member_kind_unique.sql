-- One kitchen membership per user per kitchen kind (household + restaurant can coexist).

ALTER TABLE kitchen_members ADD COLUMN IF NOT EXISTS kitchen_kind VARCHAR(20);

UPDATE kitchen_members km
SET kitchen_kind = COALESCE(k.kind, 'household')
FROM kitchens k
WHERE km.kitchen_id = k.kitchen_id
  AND (km.kitchen_kind IS NULL OR km.kitchen_kind <> COALESCE(k.kind, 'household'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM kitchen_members km
    JOIN kitchens k ON k.kitchen_id = km.kitchen_id
    GROUP BY km.user_id, COALESCE(k.kind, 'household')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '018: duplicate kitchen_members for same user and kind; resolve before applying';
  END IF;
END $$;

ALTER TABLE kitchen_members ALTER COLUMN kitchen_kind SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_members_kitchen_kind_check'
  ) THEN
    ALTER TABLE kitchen_members ADD CONSTRAINT kitchen_members_kitchen_kind_check
      CHECK (kitchen_kind IN ('household', 'restaurant'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_kitchen_member_kind()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(kind, 'household') INTO NEW.kitchen_kind
  FROM kitchens
  WHERE kitchen_id = NEW.kitchen_id;

  IF NEW.kitchen_kind IS NULL THEN
    RAISE EXCEPTION 'kitchen not found: %', NEW.kitchen_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kitchen_members_sync_kind ON kitchen_members;
CREATE TRIGGER trg_kitchen_members_sync_kind
  BEFORE INSERT OR UPDATE OF kitchen_id ON kitchen_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_kitchen_member_kind();

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_members_user_kind
  ON kitchen_members (user_id, kitchen_kind);
