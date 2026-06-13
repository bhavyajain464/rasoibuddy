-- Aggregator orders: processed (stock deducted) vs in_process (pending menu/ingredients).

ALTER TABLE restaurant_orders DROP CONSTRAINT IF EXISTS restaurant_orders_status_check;
ALTER TABLE restaurant_orders ADD CONSTRAINT restaurant_orders_status_check
    CHECK (status IN ('open', 'completed', 'void', 'processed', 'in_process'));

ALTER TABLE restaurant_order_lines ALTER COLUMN menu_item_id DROP NOT NULL;

ALTER TABLE zomato_external_orders
    ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20)
        CHECK (processing_status IN ('processed', 'in_process'));
