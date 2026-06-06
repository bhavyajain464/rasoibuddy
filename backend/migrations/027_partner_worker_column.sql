-- Partner worker: one sync job per (outlet, partner).

ALTER TABLE zomato_outlet_sync
    ADD COLUMN IF NOT EXISTS partner VARCHAR(20) NOT NULL DEFAULT 'zomato';

UPDATE zomato_outlet_sync SET partner = 'zomato' WHERE partner IS NULL OR partner = '';

-- One worker per partner per outlet: keep the most recently updated row if duplicates exist.
DELETE FROM zomato_outlet_sync a
    USING zomato_outlet_sync b
WHERE a.kitchen_id = b.kitchen_id
  AND a.partner = b.partner
  AND a.ctid < b.ctid;

COMMENT ON TABLE zomato_outlet_sync IS 'Partner workers: sync per outlet × partner. kitchen_id = our outlet.';
COMMENT ON COLUMN zomato_outlet_sync.kitchen_id IS 'Outlet id (kitchens.kitchen_id, kind=restaurant)';
COMMENT ON COLUMN zomato_outlet_sync.outlet_id IS 'Partner store id (e.g. Zomato res_id)';
COMMENT ON COLUMN zomato_outlet_sync.partner IS 'Partner slug: zomato, swiggy, dine_in';

CREATE UNIQUE INDEX IF NOT EXISTS idx_zomato_outlet_sync_outlet_partner
    ON zomato_outlet_sync (kitchen_id, partner);
