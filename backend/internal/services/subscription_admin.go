package services

import (
	"database/sql"
	"errors"
	"strings"
	"time"
)

var (
	ErrAdminUserNotFound      = errors.New("user not found")
	ErrSubscriptionNotActive  = errors.New("user has no active paid subscription")
	ErrAdminUserIDRequired    = errors.New("user_id or email is required")
)

// CancelSubscriptionResult is returned after an admin cancellation.
type CancelSubscriptionResult struct {
	UserID        string     `json:"user_id"`
	Email         string     `json:"email"`
	PreviousTier  string     `json:"previous_tier"`
	PreviousInterval string  `json:"previous_interval,omitempty"`
	PreviousExpiresAt *time.Time `json:"previous_expires_at,omitempty"`
	CancelledAt   time.Time  `json:"cancelled_at"`
	Status        string     `json:"status"`
}

// CancelSubscription immediately revokes paid access (sets tier to free, expiry to now).
func CancelSubscription(db *sql.DB, userID string) (CancelSubscriptionResult, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return CancelSubscriptionResult{}, ErrAdminUserIDRequired
	}

	var email, tier, interval sql.NullString
	var expires sql.NullTime
	err := db.QueryRow(`
		SELECT email, COALESCE(plan_tier, 'free'), plan_interval, plan_expires_at
		FROM users WHERE user_id = $1
	`, userID).Scan(&email, &tier, &interval, &expires)
	if err == sql.ErrNoRows {
		return CancelSubscriptionResult{}, ErrAdminUserNotFound
	}
	if err != nil {
		return CancelSubscriptionResult{}, err
	}

	prevTier := TierFree
	if tier.Valid {
		prevTier = NormalizeTier(tier.String)
	}
	if prevTier == TierFree {
		return CancelSubscriptionResult{}, ErrSubscriptionNotActive
	}

	now := time.Now().UTC()
	_, err = db.Exec(`
		UPDATE users SET
			plan_tier = $2,
			plan_interval = NULL,
			plan_expires_at = $3,
			plan = $2,
			updated_at = CURRENT_TIMESTAMP
		WHERE user_id = $1
	`, userID, TierFree, now)
	if err != nil {
		return CancelSubscriptionResult{}, err
	}

	res := CancelSubscriptionResult{
		UserID:      userID,
		PreviousTier: prevTier,
		CancelledAt: now,
		Status:      "cancelled",
	}
	if email.Valid {
		res.Email = email.String
	}
	if interval.Valid {
		res.PreviousInterval = interval.String
	}
	if expires.Valid {
		t := expires.Time
		res.PreviousExpiresAt = &t
	}
	return res, nil
}

// CancelSubscriptionByEmail resolves the user by email then cancels.
func CancelSubscriptionByEmail(db *sql.DB, email string) (CancelSubscriptionResult, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return CancelSubscriptionResult{}, ErrAdminUserIDRequired
	}
	var userID string
	err := db.QueryRow(`SELECT user_id::text FROM users WHERE LOWER(email) = $1`, email).Scan(&userID)
	if err == sql.ErrNoRows {
		return CancelSubscriptionResult{}, ErrAdminUserNotFound
	}
	if err != nil {
		return CancelSubscriptionResult{}, err
	}
	return CancelSubscription(db, userID)
}

// ResolveUserID returns user_id from UUID string or email lookup.
func ResolveUserID(db *sql.DB, userID, email string) (string, error) {
	if strings.TrimSpace(userID) != "" {
		return strings.TrimSpace(userID), nil
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return "", ErrAdminUserIDRequired
	}
	var id string
	err := db.QueryRow(`SELECT user_id::text FROM users WHERE LOWER(email) = $1`, email).Scan(&id)
	if err == sql.ErrNoRows {
		return "", ErrAdminUserNotFound
	}
	return id, err
}
