package services

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
)

func resolveRecipeIngredientForSave(ctx context.Context, db *sql.DB, ing RecipeIngredient) (canonicalName string, catalogID string, err error) {
	if id := strings.TrimSpace(ing.CatalogIngredientID); id != "" {
		hit, ok, lookupErr := catalogdb.LookupIngredientByID(ctx, db, id)
		if lookupErr != nil {
			return "", "", lookupErr
		}
		if ok {
			return hit.CanonicalName, hit.IngredientID, nil
		}
	}
	name := strings.TrimSpace(ing.IngredientName)
	if name == "" {
		return "", "", fmt.Errorf("ingredient name required")
	}
	cat, err := resolveGlobalCatalogIngredient(ctx, db, name)
	if err != nil {
		return "", "", err
	}
	return cat.Name, cat.IngredientID, nil
}

func enrichRecipeIngredientsFromCatalog(ctx context.Context, db *sql.DB, items []RecipeIngredient) []RecipeIngredient {
	if len(items) == 0 {
		return items
	}
	for i := range items {
		if id := strings.TrimSpace(items[i].CatalogIngredientID); id != "" {
			if hit, ok, _ := catalogdb.LookupIngredientByID(ctx, db, id); ok {
				items[i].CatalogIngredientID = hit.IngredientID
				items[i].IngredientName = hit.CanonicalName
				continue
			}
		}
		cat, err := resolveGlobalCatalogIngredient(ctx, db, items[i].IngredientName)
		if err != nil {
			continue
		}
		items[i].CatalogIngredientID = cat.IngredientID
		items[i].IngredientName = cat.Name
	}
	return items
}
