package postgres

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/pkg/contracts"
)

// Service implements contracts.KitchenService against Postgres.
type Service struct {
	db *sql.DB
}

func New(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) GetKitchen(ctx context.Context, kitchenID string) (*contracts.Kitchen, error) {
	var k contracts.Kitchen
	var planTier sql.NullString
	var createdBy sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT kitchen_id::text, name, invite_code,
		       COALESCE(kind, 'household'), plan_tier, created_by::text, created_at
		FROM kitchens WHERE kitchen_id = $1
	`, kitchenID).Scan(&k.KitchenID, &k.Name, &k.InviteCode, &k.Kind, &planTier, &createdBy, &k.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if planTier.Valid {
		k.PlanTier = &planTier.String
	}
	if createdBy.Valid {
		k.CreatedBy = &createdBy.String
	}
	return &k, nil
}

func (s *Service) ListRestaurantMemberships(ctx context.Context, userID string) ([]contracts.KitchenMember, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT km.kitchen_id::text, km.user_id::text, km.role, km.joined_at
		FROM kitchen_members km
		WHERE km.user_id = $1 AND km.kitchen_kind = 'restaurant'
		ORDER BY km.joined_at
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMembers(rows)
}

func (s *Service) GetMembership(ctx context.Context, kitchenID, userID string) (*contracts.KitchenMember, error) {
	var m contracts.KitchenMember
	err := s.db.QueryRowContext(ctx, `
		SELECT kitchen_id::text, user_id::text, role, joined_at
		FROM kitchen_members
		WHERE kitchen_id = $1 AND user_id = $2
	`, kitchenID, userID).Scan(&m.KitchenID, &m.UserID, &m.Role, &m.JoinedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Service) CreateRestaurantKitchen(ctx context.Context, ownerUserID, name string) (*contracts.Kitchen, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		trimmed = "My Restaurant"
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var k contracts.Kitchen
	for i := 0; i < 10; i++ {
		code, err := randomInviteCode()
		if err != nil {
			return nil, err
		}
		var planTierStr sql.NullString
		var createdByStr sql.NullString
		err = tx.QueryRowContext(ctx, `
			INSERT INTO kitchens (name, invite_code, created_by, kind, plan_tier)
			VALUES ($1, $2, $3, 'restaurant', 'starter')
			RETURNING kitchen_id::text, name, invite_code, kind, plan_tier, created_by::text, created_at
		`, trimmed, code, ownerUserID).Scan(
			&k.KitchenID, &k.Name, &k.InviteCode, &k.Kind, &planTierStr, &createdByStr, &k.CreatedAt,
		)
		if err == nil {
			if planTierStr.Valid {
				k.PlanTier = &planTierStr.String
			}
			if createdByStr.Valid {
				k.CreatedBy = &createdByStr.String
			}
			break
		}
		if !strings.Contains(err.Error(), "duplicate key") {
			return nil, err
		}
		if i == 9 {
			return nil, fmt.Errorf("failed to generate unique invite code")
		}
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO kitchen_members (kitchen_id, user_id, role)
		VALUES ($1, $2, 'owner')
		ON CONFLICT (kitchen_id, user_id) DO UPDATE SET role = 'owner'
	`, k.KitchenID, ownerUserID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &k, nil
}

func (s *Service) AddMember(ctx context.Context, kitchenID, userID, role string) error {
	role = normalizeRole(role)
	if role == "" {
		role = contracts.RoleStaff
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO kitchen_members (kitchen_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (kitchen_id, user_id) DO UPDATE SET role = EXCLUDED.role
	`, kitchenID, userID, role)
	return err
}

func (s *Service) UpdateMemberRole(ctx context.Context, kitchenID, userID, role string) error {
	role = normalizeRole(role)
	if role == "" {
		return fmt.Errorf("invalid role")
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE kitchen_members SET role = $3
		WHERE kitchen_id = $1 AND user_id = $2
	`, kitchenID, userID, role)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("member not found")
	}
	return nil
}

func (s *Service) RemoveMember(ctx context.Context, kitchenID, userID string) error {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM kitchen_members WHERE kitchen_id = $1 AND user_id = $2 AND role <> 'owner'
	`, kitchenID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("member not found or cannot remove owner")
	}
	return nil
}

func (s *Service) ListMembers(ctx context.Context, kitchenID string) ([]contracts.KitchenMember, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT kitchen_id::text, user_id::text, role, joined_at
		FROM kitchen_members WHERE kitchen_id = $1 ORDER BY joined_at
	`, kitchenID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMembers(rows)
}

func (s *Service) SetPlanTier(ctx context.Context, kitchenID, planTier string) error {
	planTier = strings.TrimSpace(planTier)
	if planTier == "" {
		return fmt.Errorf("plan_tier required")
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE kitchens SET plan_tier = $2, updated_at = CURRENT_TIMESTAMP
		WHERE kitchen_id = $1 AND kind = 'restaurant'
	`, kitchenID, planTier)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("restaurant kitchen not found")
	}
	return nil
}

func scanMembers(rows *sql.Rows) ([]contracts.KitchenMember, error) {
	var out []contracts.KitchenMember
	for rows.Next() {
		var m contracts.KitchenMember
		if err := rows.Scan(&m.KitchenID, &m.UserID, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case contracts.RoleOwner:
		return contracts.RoleOwner
	case contracts.RoleManager:
		return contracts.RoleManager
	case contracts.RoleStaff:
		return contracts.RoleStaff
	case contracts.RoleMember:
		return contracts.RoleMember
	default:
		return ""
	}
}

func randomInviteCode() (string, error) {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return string(b), nil
}
