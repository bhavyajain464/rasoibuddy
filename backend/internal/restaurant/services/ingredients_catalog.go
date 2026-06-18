package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
	"kitchenai-backend/pkg/units"
)

type CatalogIngredient struct {
	IngredientID string   `json:"ingredient_id"`
	Name         string   `json:"name"`
	DefaultUnit  string   `json:"default_unit"`
	Units        []string `json:"units,omitempty"`
	FoodGroup    string   `json:"food_group,omitempty"`
}

func normalizeIngredientName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func rowToCatalogIngredient(r catalogdb.IngredientRow) CatalogIngredient {
	return CatalogIngredient{
		IngredientID: r.IngredientID,
		Name:         r.Name,
		DefaultUnit:  units.Normalize(r.DefaultUnit),
		Units:        r.Units,
		FoodGroup:    r.FoodGroup,
	}
}

// ListCatalogIngredients returns verified ingredients from the shared home-kitchen catalog (Postgres).
func ListCatalogIngredients(ctx context.Context, db *sql.DB) ([]CatalogIngredient, error) {
	return SearchCatalogIngredients(ctx, db, "")
}

// SearchCatalogIngredients searches the shared ingredients catalog (pg_trgm on aliases).
func SearchCatalogIngredients(ctx context.Context, db *sql.DB, query string) ([]CatalogIngredient, error) {
	rows, err := catalogdb.SearchIngredients(ctx, db, query)
	if err != nil {
		return nil, err
	}
	out := make([]CatalogIngredient, 0, len(rows))
	for _, r := range rows {
		out = append(out, rowToCatalogIngredient(r))
	}
	return out, nil
}

func resolveGlobalCatalogIngredient(ctx context.Context, db *sql.DB, name string) (CatalogIngredient, error) {
	hit, ok, err := catalogdb.LookupIngredient(ctx, db, name)
	if err != nil {
		return CatalogIngredient{}, err
	}
	if !ok {
		return CatalogIngredient{}, fmt.Errorf("ingredient not in catalog")
	}
	return CatalogIngredient{
		IngredientID: hit.IngredientID,
		Name:         hit.CanonicalName,
		DefaultUnit:  units.Normalize(hit.DefaultUnit),
		Units:        hit.Units,
		FoodGroup:    hit.FoodGroup,
	}, nil
}
