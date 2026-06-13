-- Users may belong to multiple restaurant kitchens (staff across businesses).
-- Still at most one household kitchen per user.

DROP INDEX IF EXISTS idx_kitchen_members_user_kind;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_members_user_household
  ON kitchen_members (user_id)
  WHERE kitchen_kind = 'household';
