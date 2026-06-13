package domain

// Product vocabulary (restaurant / partner app):
//
//   Outlet            — our business location (kitchens.kitchen_id, kind=restaurant).
//   Partner           — order source: zomato, swiggy, dineout, …
//   Partner outlet id — store id on the partner platform (DB: partner_order_sync.partner_outlet_id).
//   Worker            — background sync job for (outlet × partner).
//
// Table partner_order_sync (was zomato_outlet_sync). Session cookies stay in zomato_kitchen_auth for now.

const (
	PartnerZomato   = "zomato"
	PartnerSwiggy   = "swiggy"
	PartnerDineout  = "dineout"
	PartnerDineIn   = "dineout" // legacy alias
)
