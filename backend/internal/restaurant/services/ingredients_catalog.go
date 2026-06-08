package services

import (
	"context"
	"database/sql"
	"strings"

	"kitchenai-backend/pkg/units"
)

type CatalogIngredient struct {
	IngredientID string `json:"ingredient_id"`
	Name         string `json:"name"`
	DefaultUnit  string `json:"default_unit"`
	FoodGroup    string `json:"food_group,omitempty"`
}

func normalizeIngredientName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// ListCatalogIngredients returns all approved global restaurant ingredients.
func ListCatalogIngredients(ctx context.Context, db *sql.DB) ([]CatalogIngredient, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT ingredient_id::text, name, default_unit, food_group
		FROM restaurant_ingredients
		ORDER BY LOWER(name)
	`)
	if err != nil {
		if catalogTableMissing(err) {
			return []CatalogIngredient{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	out := make([]CatalogIngredient, 0)
	for rows.Next() {
		var row CatalogIngredient
		if err := rows.Scan(&row.IngredientID, &row.Name, &row.DefaultUnit, &row.FoodGroup); err != nil {
			return nil, err
		}
		row.DefaultUnit = units.Normalize(row.DefaultUnit)
		out = append(out, row)
	}
	return out, rows.Err()
}

func catalogTableMissing(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "does not exist") && strings.Contains(msg, "restaurant_ingredients")
}
