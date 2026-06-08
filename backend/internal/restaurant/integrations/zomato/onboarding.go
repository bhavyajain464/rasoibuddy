package zomato

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	restsvc "kitchenai-backend/internal/restaurant/services"
)

func normalizePartnerOutletID(id string) string {
	return strings.TrimSpace(id)
}

func normalizeOutletID(id string) string {
	return normalizePartnerOutletID(id)
}

func (s *Service) KitchenIDByPartnerOutletID(ctx context.Context, partnerOutletID string) (string, error) {
	partnerOutletID = normalizePartnerOutletID(partnerOutletID)
	if partnerOutletID == "" {
		return "", fmt.Errorf("partner_outlet_id required")
	}
	var kitchenID string
	err := s.db.QueryRowContext(ctx, `
		SELECT kitchen_id::text FROM partner_order_sync
		WHERE partner_outlet_id = $1
	`, partnerOutletID).Scan(&kitchenID)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("no outlet registered for partner store id %s", partnerOutletID)
	}
	if err != nil {
		return "", err
	}
	return kitchenID, nil
}

func (s *Service) KitchenIDByOutletID(ctx context.Context, partnerOutletID string) (string, error) {
	return s.KitchenIDByPartnerOutletID(ctx, partnerOutletID)
}

func (s *Service) IsPartnerOutletRegistered(ctx context.Context, partnerOutletID string) (bool, error) {
	partnerOutletID = normalizePartnerOutletID(partnerOutletID)
	if partnerOutletID == "" {
		return false, fmt.Errorf("partner_outlet_id required")
	}
	var exists bool
	err := s.db.QueryRowContext(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM partner_order_sync
			WHERE partner_outlet_id = $1
		)
	`, partnerOutletID).Scan(&exists)
	return exists, err
}

func (s *Service) IsOutletRegistered(ctx context.Context, partnerOutletID string) (bool, error) {
	return s.IsPartnerOutletRegistered(ctx, partnerOutletID)
}

func (s *Service) PartnerOutletIDForKitchen(ctx context.Context, kitchenID string) (string, error) {
	var outletID string
	err := s.db.QueryRowContext(ctx, `
		SELECT partner_outlet_id FROM partner_order_sync
		WHERE kitchen_id = $1
		ORDER BY updated_at DESC
		LIMIT 1
	`, kitchenID).Scan(&outletID)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("partner_outlet_id required — link Zomato on this outlet first")
	}
	if err != nil {
		return "", err
	}
	outletID = normalizePartnerOutletID(outletID)
	if outletID == "" {
		return "", fmt.Errorf("partner_outlet_id required — link Zomato on this outlet first")
	}
	return outletID, nil
}

func (s *Service) ValidateAuthForPartnerOutlet(ctx context.Context, auth *Auth, partnerOutletID string) error {
	partnerOutletID = normalizePartnerOutletID(partnerOutletID)
	if partnerOutletID == "" {
		return fmt.Errorf("partner_outlet_id required — e.g. Zomato res_id 22267610")
	}
	return s.verifyAuth(ctx, auth, partnerOutletID)
}

func (s *Service) ValidateAuthForOutlet(ctx context.Context, auth *Auth, partnerOutletID string) error {
	return s.ValidateAuthForPartnerOutlet(ctx, auth, partnerOutletID)
}

// SaveProvisionedSession stores validated partner auth and registers the worker (idle) on the outlet.
func (s *Service) SaveProvisionedSession(ctx context.Context, kitchenID, actorUserID, partnerOutletID, partnerOutletName string, auth *Auth) error {
	partnerOutletID = normalizePartnerOutletID(partnerOutletID)
	if partnerOutletID == "" {
		return fmt.Errorf("partner_outlet_id required")
	}
	if auth == nil || len(auth.Cookies) == 0 {
		return fmt.Errorf("cookies required")
	}
	if err := s.saveKitchenAuth(ctx, kitchenID, auth); err != nil {
		return err
	}
	return s.upsertPartnerWorker(ctx, kitchenID, actorUserID, "zomato", partnerOutletID, partnerOutletName, StatusIdle)
}

// FetchAndSeedMenu pulls the partner menu once and seeds kitchen menu + inventory.
func (s *Service) FetchAndSeedMenu(ctx context.Context, kitchenID, actorUserID, outletID string, auth *Auth) (*restsvc.ZomatoMenuSeedResult, error) {
	if s.menu == nil {
		return nil, fmt.Errorf("menu service not configured")
	}
	if auth == nil {
		var err error
		auth, err = s.loadKitchenAuth(ctx, kitchenID)
		if err != nil {
			return nil, err
		}
	}
	if auth == nil {
		return nil, &AuthError{Code: "login_required", Message: "Zomato session not configured — import partner cookies in Settings"}
	}
	raw, err := s.fetchContentMenu(ctx, auth, outletID)
	if err != nil {
		return nil, err
	}
	dishes, err := restsvc.ParseZomatoMenuJSON(raw)
	if err != nil {
		return nil, err
	}
	return s.menu.SeedFromZomatoDishes(ctx, kitchenID, actorUserID, dishes)
}
