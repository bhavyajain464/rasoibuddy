package invites

import (
	"context"
	"database/sql"
	"strings"

	"kitchenai-backend/internal/restaurant/staff"
	"kitchenai-backend/pkg/contracts"
)

// ApplyPendingStaffInvites adds the user to outlets they were invited to by email.
func ApplyPendingStaffInvites(ctx context.Context, db *sql.DB, userID, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || userID == "" {
		return nil
	}
	rows, err := db.QueryContext(ctx, `
		SELECT kitchen_id::text, role
		FROM restaurant_staff_invites
		WHERE LOWER(email) = $1
	`, email)
	if err != nil {
		if isMissingInvitesTable(err) {
			return nil
		}
		return err
	}
	defer rows.Close()

	type invite struct {
		kitchenID string
		role      string
	}
	var pending []invite
	for rows.Next() {
		var inv invite
		if err := rows.Scan(&inv.kitchenID, &inv.role); err != nil {
			return err
		}
		pending = append(pending, inv)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, inv := range pending {
		blocked, err := staff.IsRevoked(ctx, db, inv.kitchenID, userID, email)
		if err != nil {
			return err
		}
		if blocked {
			continue
		}
		role := normalizeRole(inv.role)
		if _, err := db.ExecContext(ctx, `
			INSERT INTO kitchen_members (kitchen_id, user_id, role)
			VALUES ($1, $2, $3)
			ON CONFLICT (kitchen_id, user_id) DO UPDATE SET role = EXCLUDED.role
		`, inv.kitchenID, userID, role); err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `
			DELETE FROM restaurant_staff_invites
			WHERE kitchen_id = $1 AND email = $2
		`, inv.kitchenID, email); err != nil {
			return err
		}
	}
	return nil
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case contracts.RoleOwner, contracts.RoleManager, contracts.RoleStaff, contracts.RoleMember:
		return strings.ToLower(strings.TrimSpace(role))
	default:
		return contracts.RoleStaff
	}
}

func isMissingInvitesTable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "does not exist") && strings.Contains(msg, "restaurant_staff_invites")
}
