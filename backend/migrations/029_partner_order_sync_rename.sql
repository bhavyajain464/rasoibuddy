-- Partner-neutral naming: order sync workers per (outlet × partner).

ALTER TABLE IF EXISTS zomato_outlet_sync RENAME TO partner_order_sync;

ALTER TABLE partner_order_sync
    RENAME COLUMN outlet_id TO partner_outlet_id;

ALTER TABLE partner_order_sync
    RENAME COLUMN outlet_name TO partner_outlet_name;

ALTER INDEX IF EXISTS idx_zomato_outlet_sync_outlet_id
    RENAME TO idx_partner_order_sync_partner_outlet_id;

ALTER INDEX IF EXISTS idx_zomato_outlet_sync_outlet_partner
    RENAME TO idx_partner_order_sync_kitchen_partner;

UPDATE partner_order_sync SET partner = 'dineout' WHERE partner IN ('dine_in', 'dine-in');

COMMENT ON TABLE partner_order_sync IS 'Partner order sync: one worker per (our outlet × partner).';
COMMENT ON COLUMN partner_order_sync.kitchen_id IS 'Our outlet (kitchens.kitchen_id, kind=restaurant)';
COMMENT ON COLUMN partner_order_sync.partner IS 'Partner: zomato, swiggy, dineout';
COMMENT ON COLUMN partner_order_sync.partner_outlet_id IS 'Partner platform store id (e.g. Zomato res_id)';
COMMENT ON COLUMN partner_order_sync.partner_outlet_name IS 'Optional display name for partner store';
