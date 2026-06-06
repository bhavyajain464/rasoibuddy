package zomato

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

func normalizeOutletID(outletID string) string {
	return strings.TrimSpace(outletID)
}

func (s *Service) KitchenIDByOutletID(ctx context.Context, outletID string) (string, error) {
	outletID = normalizeOutletID(outletID)
	if outletID == "" {
		return "", fmt.Errorf("outlet_id required")
	}
	var kitchenID string
	err := s.db.QueryRowContext(ctx, `
		SELECT kitchen_id::text FROM zomato_kitchen_sync
		WHERE outlet_id = $1
	`, outletID).Scan(&kitchenID)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("no restaurant registered for outlet ID %s", outletID)
	}
	if err != nil {
		return "", err
	}
	return kitchenID, nil
}

func (s *Service) IsOutletRegistered(ctx context.Context, outletID string) (bool, error) {
	outletID = normalizeOutletID(outletID)
	if outletID == "" {
		return false, fmt.Errorf("outlet_id required")
	}
	var exists bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM zomato_kitchen_sync
			WHERE outlet_id = $1 AND outlet_id IS NOT NULL AND outlet_id <> ''
		)
	`, outletID).Scan(&exists)
	return exists, err
}

func (s *Service) ValidateAuthForOutlet(ctx context.Context, auth *Auth, outletID string) error {
	outletID = normalizeOutletID(outletID)
	if outletID == "" {
		return fmt.Errorf("outlet_id required — Zomato restaurant ID (e.g. 22267610)")
	}
	return s.verifyAuth(ctx, auth, outletID)
}

// SaveProvisionedSession stores a phase-1-validated Zomato session and outlet on the kitchen
// so the owner can retry sync from Settings if polling fails to start.
func (s *Service) SaveProvisionedSession(ctx context.Context, kitchenID, actorUserID, outletID, outletName string, auth *Auth) error {
	outletID = normalizeOutletID(outletID)
	if outletID == "" {
		return fmt.Errorf("outlet_id required")
	}
	if auth == nil || len(auth.Cookies) == 0 {
		return fmt.Errorf("cookies required")
	}
	outletName = strings.TrimSpace(outletName)
	if outletName == "" {
		outletName = "Outlet " + outletID
	}
	raw, err := json.Marshal(auth)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO zomato_kitchen_sync (kitchen_id, status, outlet_id, outlet_name, auth_json, auth_refreshed_at, actor_user_id, last_error, updated_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, NULL, CURRENT_TIMESTAMP)
		ON CONFLICT (kitchen_id) DO UPDATE SET
			status = EXCLUDED.status,
			outlet_id = EXCLUDED.outlet_id,
			outlet_name = EXCLUDED.outlet_name,
			auth_json = EXCLUDED.auth_json,
			auth_refreshed_at = CURRENT_TIMESTAMP,
			actor_user_id = EXCLUDED.actor_user_id,
			last_error = NULL,
			updated_at = CURRENT_TIMESTAMP
	`, kitchenID, StatusIdle, outletID, outletName, string(raw), actorUserID)
	return err
}
