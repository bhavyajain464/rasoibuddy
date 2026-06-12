package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"kitchenai-backend/internal/services/ingredients"
)

// GetIngredientsCatalog returns the home-ingredient catalog for inventory/shopping pickers.
func GetIngredientsCatalog() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		items := ingredients.Search(q)
		if items == nil {
			items = []ingredients.CatalogIngredient{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(items)
	}
}
