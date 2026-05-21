-- Proration fields on Razorpay checkout orders (upgrade credit from unused days).

ALTER TABLE razorpay_orders
    ADD COLUMN IF NOT EXISTS list_price_paise INT;

ALTER TABLE razorpay_orders
    ADD COLUMN IF NOT EXISTS credit_paise INT NOT NULL DEFAULT 0;

ALTER TABLE razorpay_orders
    ADD COLUMN IF NOT EXISTS is_upgrade BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE razorpay_orders SET list_price_paise = amount_paise WHERE list_price_paise IS NULL;
