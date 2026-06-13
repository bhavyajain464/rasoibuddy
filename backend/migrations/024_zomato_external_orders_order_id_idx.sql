-- Speed up order list enrichment (batch external ID lookup by order_id).
CREATE INDEX IF NOT EXISTS idx_zomato_external_orders_order_id ON zomato_external_orders(order_id);
