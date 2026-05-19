package services

import (
	"database/sql"
	"errors"
	"strings"

	"kitchenai-backend/internal/models"

	"github.com/lib/pq"
)

var ErrCookProfileNotConfigured = errors.New("cook profile not configured")

// LoadCookProfileForUser returns the user's cook profile, or an empty unconfigured profile if none exists.
func LoadCookProfileForUser(db *sql.DB, userID string) (*models.CookProfile, error) {
	var profile models.CookProfile
	err := db.QueryRow(`
		SELECT cook_id, COALESCE(cook_name, ''), dishes_known, preferred_lang, COALESCE(phone_number, ''), created_at, updated_at
		FROM cook_profile
		WHERE user_id = $1
	`, userID).Scan(
		&profile.CookID,
		&profile.CookName,
		pq.Array(&profile.DishesKnown),
		&profile.PreferredLang,
		&profile.PhoneNumber,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return emptyCookProfile(), nil
	}
	if err != nil {
		return nil, err
	}
	profile.Configured = CookProfileIsConfigured(&profile)
	if profile.DishesKnown == nil {
		profile.DishesKnown = []string{}
	}
	return &profile, nil
}

// RequireConfiguredCookProfile returns the profile only when a WhatsApp number is saved for the user.
func RequireConfiguredCookProfile(db *sql.DB, userID string) (*models.CookProfile, error) {
	profile, err := LoadCookProfileForUser(db, userID)
	if err != nil {
		return nil, err
	}
	if !profile.Configured {
		return nil, ErrCookProfileNotConfigured
	}
	return profile, nil
}

func CookProfileIsConfigured(p *models.CookProfile) bool {
	return p != nil && strings.TrimSpace(p.PhoneNumber) != ""
}

func emptyCookProfile() *models.CookProfile {
	return &models.CookProfile{
		DishesKnown:   []string{},
		PreferredLang: "en",
		Configured:    false,
	}
}
