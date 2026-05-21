-- Razorpay premium checkout orders (one-time payment → plan = premium).

CREATE TABLE IF NOT EXISTS razorpay_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    razorpay_order_id TEXT NOT NULL UNIQUE,
    amount_paise INT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'paid', 'failed')),
    razorpay_payment_id TEXT,
    razorpay_env TEXT NOT NULL DEFAULT 'staging'
        CHECK (razorpay_env IN ('staging', 'production')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_razorpay_orders_user ON razorpay_orders (user_id, created_at DESC);
