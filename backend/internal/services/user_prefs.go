package services

import (
	"database/sql"

	"github.com/lib/pq"
)

// LoadUserPrefs loads kitchen preferences for prompts and diet analysis.
func LoadUserPrefs(db *sql.DB, userID string) (*UserPrefsData, error) {
	var up UserPrefsData
	var householdSize sql.NullInt64
	var spiceLevel, cookingSkill sql.NullString
	err := db.QueryRow(`
		SELECT dislikes, dietary_tags, fav_cuisines,
			COALESCE(allergies, '{}'), COALESCE(household_size, 2),
			COALESCE(spice_level, 'medium'), COALESCE(cooking_skill, 'intermediate')
		FROM user_prefs
		WHERE user_id = $1
	`, userID).Scan(pq.Array(&up.Dislikes), pq.Array(&up.DietaryTags), pq.Array(&up.FavCuisines),
		pq.Array(&up.Allergies), &householdSize, &spiceLevel, &cookingSkill)
	if err == sql.ErrNoRows {
		return &UserPrefsData{HouseholdSize: 2, SpiceLevel: "medium", CookingSkill: "intermediate"}, nil
	}
	if err != nil {
		return nil, err
	}
	if householdSize.Valid {
		up.HouseholdSize = int(householdSize.Int64)
	} else {
		up.HouseholdSize = 2
	}
	if spiceLevel.Valid {
		up.SpiceLevel = spiceLevel.String
	}
	if cookingSkill.Valid {
		up.CookingSkill = cookingSkill.String
	}
	return &up, nil
}
