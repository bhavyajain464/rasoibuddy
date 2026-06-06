package staff

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isMissingTable(err error, table string) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "does not exist") && strings.Contains(msg, strings.ToLower(table))
}

// IsRevoked reports whether the user/email is blocked from joining the outlet.
func IsRevoked(ctx context.Context, db *sql.DB, kitchenID, userID, email string) (bool, error) {
	email = normalizeEmail(email)
	if kitchenID == "" || (email == "" && userID == "") {
		return false, nil
	}
	var blocked bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM restaurant_staff_revocations
			WHERE kitchen_id = $1
			  AND (
			    ($2 <> '' AND user_id = $2::uuid)
			    OR ($3 <> '' AND LOWER(email) = $3)
			  )
		)
	`, kitchenID, strings.TrimSpace(userID), email).Scan(&blocked)
	if err != nil {
		if isMissingTable(err, "restaurant_staff_revocations") {
			return false, nil
		}
		return false, err
	}
	return blocked, nil
}

// ClearRevocation removes the block when an owner re-adds staff.
func ClearRevocation(ctx context.Context, db *sql.DB, kitchenID, email string) error {
	email = normalizeEmail(email)
	if kitchenID == "" || email == "" {
		return nil
	}
	_, err := db.ExecContext(ctx, `
		DELETE FROM restaurant_staff_revocations
		WHERE kitchen_id = $1 AND LOWER(email) = $2
	`, kitchenID, email)
	if err != nil && isMissingTable(err, "restaurant_staff_revocations") {
		return nil
	}
	return err
}

// RevokeUserSessions logs the user out everywhere.
func RevokeUserSessions(ctx context.Context, db *sql.DB, userID string) error {
	if strings.TrimSpace(userID) == "" {
		return nil
	}
	_, err := db.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = $1`, userID)
	return err
}

// RemoveMember removes staff, records a revocation, and revokes their sessions.
func RemoveMember(ctx context.Context, db *sql.DB, kitchenID, userID, revokedBy string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return fmt.Errorf("user_id required")
	}

	var email string
	var role string
	err := db.QueryRowContext(ctx, `
		SELECT LOWER(u.email), km.role
		FROM kitchen_members km
		JOIN users u ON u.user_id = km.user_id
		WHERE km.kitchen_id = $1 AND km.user_id = $2
	`, kitchenID, userID).Scan(&email, &role)
	if err == sql.ErrNoRows {
		return fmt.Errorf("member not found or cannot remove owner")
	}
	if err != nil {
		return err
	}
	if role == "owner" {
		return fmt.Errorf("member not found or cannot remove owner")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		DELETE FROM kitchen_members
		WHERE kitchen_id = $1 AND user_id = $2 AND role <> 'owner'
	`, kitchenID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("member not found or cannot remove owner")
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO restaurant_staff_revocations (kitchen_id, email, user_id, revoked_by)
		VALUES ($1, $2, $3, NULLIF($4, '')::uuid)
		ON CONFLICT (kitchen_id, email) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			revoked_by = EXCLUDED.revoked_by,
			revoked_at = CURRENT_TIMESTAMP
	`, kitchenID, email, userID, revokedBy)
	if err != nil && !isMissingTable(err, "restaurant_staff_revocations") {
		return err
	}

	_, _ = tx.ExecContext(ctx, `
		DELETE FROM restaurant_staff_invites
		WHERE kitchen_id = $1 AND LOWER(email) = $2
	`, kitchenID, email)

	if _, err := tx.ExecContext(ctx, `DELETE FROM auth_sessions WHERE user_id = $1`, userID); err != nil {
		return err
	}

	return tx.Commit()
}

// CancelInvite deletes a pending email invite (does not block future invites).
func CancelInvite(ctx context.Context, db *sql.DB, kitchenID, email string) error {
	email = normalizeEmail(email)
	if email == "" {
		return fmt.Errorf("email required")
	}
	res, err := db.ExecContext(ctx, `
		DELETE FROM restaurant_staff_invites
		WHERE kitchen_id = $1 AND LOWER(email) = $2
	`, kitchenID, email)
	if err != nil {
		if isMissingTable(err, "restaurant_staff_invites") {
			return fmt.Errorf("staff invites not configured")
		}
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("invite not found")
	}
	return nil
}
