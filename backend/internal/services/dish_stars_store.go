package services

import (
	"database/sql"
	"strings"
)

// NormalizeDishName is the stable key for matching catalog rows to global stars.
func NormalizeDishName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// LoadGlobalStarCounts returns normalized dish_name -> total stars from all users.
func LoadGlobalStarCounts(db *sql.DB) (map[string]int, error) {
	rows, err := db.Query(`SELECT dish_name, star_count FROM dish_star_counts WHERE star_count > 0`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]int{}
	for rows.Next() {
		var name string
		var n int
		if err := rows.Scan(&name, &n); err != nil {
			return nil, err
		}
		if n > 0 {
			out[name] = n
		}
	}
	return out, rows.Err()
}

// LoadUserStarredDishes returns dishes the user has already starred (normalized keys).
func LoadUserStarredDishes(db *sql.DB, userID string) (map[string]bool, error) {
	rows, err := db.Query(`
		SELECT dish_name FROM dish_user_stars WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		if name != "" {
			out[name] = true
		}
	}
	return out, rows.Err()
}

// ToggleDishStar stars or unstars a dish for the user (GitHub-style toggle).
// Star: +1 global count. Unstar: -1 global count (min 0).
func ToggleDishStar(db *sql.DB, userID, dishName string) (starCount int, userStarred bool, err error) {
	key := NormalizeDishName(dishName)
	if key == "" {
		return 0, false, sql.ErrNoRows
	}

	tx, err := db.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	var exists bool
	err = tx.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM dish_user_stars WHERE user_id = $1 AND dish_name = $2
		)
	`, userID, key).Scan(&exists)
	if err != nil {
		return 0, false, err
	}

	if exists {
		if _, err = tx.Exec(`
			DELETE FROM dish_user_stars WHERE user_id = $1 AND dish_name = $2
		`, userID, key); err != nil {
			return 0, false, err
		}
		err = tx.QueryRow(`
			UPDATE dish_star_counts
			SET star_count = GREATEST(star_count - 1, 0), updated_at = NOW()
			WHERE dish_name = $1
			RETURNING star_count
		`, key).Scan(&starCount)
		if err == sql.ErrNoRows {
			starCount = 0
			err = nil
		}
		if err != nil {
			return 0, false, err
		}
		if starCount == 0 {
			_, _ = tx.Exec(`DELETE FROM dish_star_counts WHERE dish_name = $1 AND star_count = 0`, key)
		}
		if err := tx.Commit(); err != nil {
			return 0, false, err
		}
		return starCount, false, nil
	}

	_, err = tx.Exec(`
		INSERT INTO dish_user_stars (user_id, dish_name) VALUES ($1, $2)
	`, userID, key)
	if err != nil {
		return 0, false, err
	}

	err = tx.QueryRow(`
		INSERT INTO dish_star_counts (dish_name, star_count, updated_at)
		VALUES ($1, 1, NOW())
		ON CONFLICT (dish_name)
		DO UPDATE SET
			star_count = dish_star_counts.star_count + 1,
			updated_at = NOW()
		RETURNING star_count
	`, key).Scan(&starCount)
	if err != nil {
		return 0, false, err
	}

	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return starCount, true, nil
}
