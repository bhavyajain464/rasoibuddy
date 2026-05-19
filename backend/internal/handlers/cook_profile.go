package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"kitchenai-backend/internal/models"
	"kitchenai-backend/internal/services"

	"github.com/lib/pq"
)

// GetCookProfile returns the cook profile for the authenticated user
func GetCookProfile(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)

		profile, err := services.LoadCookProfileForUser(db, userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(profile)
	}
}

// UpdateCookProfile updates the cook profile for the authenticated user
func UpdateCookProfile(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)

		var req models.CookProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if req.PreferredLang == "" {
			req.PreferredLang = "en"
		}

		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM cook_profile WHERE user_id = $1)", userID).Scan(&exists)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if exists {
			_, err := db.Exec(`
				UPDATE cook_profile
				SET dishes_known = $1, preferred_lang = $2, phone_number = $3, cook_name = NULLIF(TRIM($4), '')
				WHERE user_id = $5
			`, pq.Array(req.DishesKnown), req.PreferredLang, req.PhoneNumber, req.CookName, userID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		} else {
			_, err := db.Exec(`
				INSERT INTO cook_profile (dishes_known, preferred_lang, phone_number, cook_name, user_id)
				VALUES ($1, $2, $3, NULLIF(TRIM($4), ''), $5)
			`, pq.Array(req.DishesKnown), req.PreferredLang, req.PhoneNumber, req.CookName, userID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Cook profile updated successfully"})
	}
}
