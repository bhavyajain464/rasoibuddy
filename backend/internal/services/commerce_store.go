package services

import (
	"database/sql"
	"encoding/json"
)

// RecordOrderIntent persists a click on "order this list" for attribution/analytics.
// Best-effort: a failure here must not block returning the link to the user.
func RecordOrderIntent(db *sql.DB, userID, kitchenID, partner, source, trackingID string, items []OrderLinkItem) error {
	if db == nil {
		return nil
	}
	payload, err := json.Marshal(items)
	if err != nil {
		payload = []byte("[]")
	}
	var uid, kid interface{}
	if userID != "" {
		uid = userID
	}
	if kitchenID != "" {
		kid = kitchenID
	}
	_, err = db.Exec(`
		INSERT INTO commerce_order_intents (user_id, kitchen_id, partner, source, items, item_count, tracking_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, uid, kid, partner, source, payload, len(items), trackingID)
	return err
}
