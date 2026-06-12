package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

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

// AdminBackfillInventoryCatalog POST /admin/inventory/backfill-catalog
// Optional JSON body: { "kitchen_id": "..." } — omit to fix all kitchens.
func AdminBackfillInventoryCatalog(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			KitchenID string `json:"kitchen_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
		defer cancel()

		res, err := ingredients.BackfillInventoryCatalog(ctx, db, strings.TrimSpace(req.KitchenID))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	}
}
