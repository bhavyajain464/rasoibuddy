package services

import (
	"context"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
)

// PairDisplayLabel returns a household-facing label for a canonical pair id or legacy label.
func PairDisplayLabel(idOrLabel string) string {
	idOrLabel = strings.TrimSpace(idOrLabel)
	if idOrLabel == "" {
		return ""
	}
	if dish, ok := FindCatalogDishByID(idOrLabel); ok {
		return dish.DisplayLabel()
	}
	if line, ok := ingredientLineByID(idOrLabel); ok {
		return line.Name
	}
	if dish, ok := FindCatalogDishByPairLabel(idOrLabel); ok {
		return dish.DisplayLabel()
	}
	if line, ok := lookupCatalogIngredient(idOrLabel); ok {
		return line.Name
	}
	return titleIngredientToken(idOrLabel)
}

// PairDisplayLabels maps canonical pair ids to display labels for the API.
func PairDisplayLabels(ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	out := make([]string, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		label := PairDisplayLabel(id)
		key := strings.ToLower(label)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, label)
	}
	return out
}

func ingredientLineByID(id string) (IngredientLine, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return IngredientLine{}, false
	}
	conn := catalogdb.DB()
	if conn == nil {
		return IngredientLine{}, false
	}
	hit, ok, err := catalogdb.LookupIngredientByID(context.Background(), conn, id)
	if err != nil || !ok {
		return IngredientLine{}, false
	}
	return IngredientLine{IngredientID: hit.IngredientID, Name: hit.CanonicalName}, true
}
