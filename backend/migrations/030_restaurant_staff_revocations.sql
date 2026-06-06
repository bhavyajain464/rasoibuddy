-- Staff removed from an outlet cannot re-join until the owner adds them back.

CREATE TABLE IF NOT EXISTS restaurant_staff_revocations (
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    revoked_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kitchen_id, email)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_staff_revocations_user
    ON restaurant_staff_revocations (user_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_staff_revocations_email_lower
    ON restaurant_staff_revocations (LOWER(email));

COMMENT ON TABLE restaurant_staff_revocations IS 'Removed staff blocked from re-joining until owner re-invites.';
