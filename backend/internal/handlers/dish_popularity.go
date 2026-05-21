package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"kitchenai-backend/internal/services"
)

type starDishRequest struct {
	DishName string `json:"dish_name"`
}

// StarDish toggles a global star for a dish (+1 / -1). One star per user; tap again to remove.
func StarDish(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		var req starDishRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.DishName) == "" {
			http.Error(w, "dish_name is required", http.StatusBadRequest)
			return
		}
		count, starred, err := services.ToggleDishStar(db, userID, req.DishName)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"star_count":   count,
			"user_starred": starred,
		})
	}
}
