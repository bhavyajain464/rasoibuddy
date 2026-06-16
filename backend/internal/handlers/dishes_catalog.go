package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"
)

// GetDishesCatalog GET /dishes?q=&meal_slot=&limit=
func GetDishesCatalog() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		mealSlot := strings.TrimSpace(r.URL.Query().Get("meal_slot"))
		limit := defaultDishSearchLimit
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 {
				limit = n
			}
		}
		items := services.SearchDishCatalog(q, mealSlot, limit)
		if items == nil {
			items = []services.DishCatalogSearchItem{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(items)
	}
}

// GetDishLookup GET /dishes/lookup?dish_id=&name=
func GetDishLookup(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dishID := strings.TrimSpace(r.URL.Query().Get("dish_id"))
		name := strings.TrimSpace(r.URL.Query().Get("name"))
		item, ok := services.LookupCatalogDish(dishID, name)
		if !ok {
			http.Error(w, "dish not found", http.StatusNotFound)
			return
		}
		cdn := ""
		if cfg != nil {
			cdn = cfg.DishImagesCDNURL
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":          item.ID,
			"name":        item.Name,
			"meal_types":  item.MealTypes,
			"cuisine":     item.Cuisine,
			"cook_time_mins": item.CookTimeMins,
			"image_urls":  services.DishImageURLs(cdn, item.ID),
		})
	}
}

const defaultDishSearchLimit = 120
