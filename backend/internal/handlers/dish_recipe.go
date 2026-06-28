package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"kitchenai-backend/internal/services"
)

const (
	dishRecipeLegacyMaxLimit = 500
	dishRecipePageDefault    = 30
	dishRecipePageMax        = 100
)

func dishRecipeWantsPagination(r *http.Request) bool {
	q := r.URL.Query()
	_, hasOffset := q["offset"]
	_, hasPage := q["page"]
	return hasOffset || hasPage
}

func parseDishRecipePagination(r *http.Request) (offset, limit int) {
	limit = dishRecipePageDefault
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > dishRecipePageMax {
		limit = dishRecipePageMax
	}

	offset = 0
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 0 {
			offset = n
		}
		return offset, limit
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("page")); raw != "" {
		page := 1
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			page = n
		}
		offset = (page - 1) * limit
	}
	return offset, limit
}

// ListDishRecipes GET /dishes/recipes?q=&limit=&offset=&page=
// Legacy (no offset/page): returns a JSON array. Paginated: returns { items, total, offset, limit, has_more }.
func ListDishRecipes(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		w.Header().Set("Content-Type", "application/json")

		if dishRecipeWantsPagination(r) {
			offset, limit := parseDishRecipePagination(r)
			page, err := services.ListDishRecipesPage(r.Context(), db, q, offset, limit)
			if err != nil {
				http.Error(w, "failed to list recipes", http.StatusInternalServerError)
				return
			}
			if page.Items == nil {
				page.Items = []services.DishRecipeSummary{}
			}
			_ = json.NewEncoder(w).Encode(page)
			return
		}

		limit := dishRecipeLegacyMaxLimit
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 {
				limit = n
			}
		}
		if limit > dishRecipeLegacyMaxLimit {
			limit = dishRecipeLegacyMaxLimit
		}
		items, err := services.ListDishRecipes(r.Context(), db, q, limit)
		if err != nil {
			http.Error(w, "failed to list recipes", http.StatusInternalServerError)
			return
		}
		if items == nil {
			items = []services.DishRecipeSummary{}
		}
		_ = json.NewEncoder(w).Encode(items)
	}
}

// GetDishRecipe GET /dishes/{dish_id}/recipe
func GetDishRecipe(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dishID := strings.TrimSpace(mux.Vars(r)["dish_id"])
		if dishID == "" {
			http.Error(w, "dish_id is required", http.StatusBadRequest)
			return
		}
		row, ok, err := services.FindDishRecipeByDishID(r.Context(), db, dishID)
		if err != nil {
			http.Error(w, "failed to load recipe", http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, "recipe not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(row)
	}
}
