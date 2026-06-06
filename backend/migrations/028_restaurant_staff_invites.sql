-- Pending staff invites by email; applied on first Google sign-in.

CREATE TABLE IF NOT EXISTS restaurant_staff_invites (
    invite_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(kitchen_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff'
      CHECK (role IN ('owner', 'manager', 'staff', 'member')),
    invited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (kitchen_id, email)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_staff_invites_email_lower
    ON restaurant_staff_invites (LOWER(email));

COMMENT ON TABLE restaurant_staff_invites IS 'Staff invited by email before they sign in; applied on login.';
