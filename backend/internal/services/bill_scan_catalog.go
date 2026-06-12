package services

import (
	"strings"

	"kitchenai-backend/internal/services/ingredients"
	"kitchenai-backend/pkg/units"
)

// ApplyCatalogMapping keeps only bill lines that resolve to the ingredient catalog.
// Matched lines get canonical name, ingredient_id, and food_group from the catalog.
func ApplyCatalogMapping(items []BillItem) (matched []BillItem, skipped []string) {
	for _, item := range items {
		rawName := strings.TrimSpace(item.Name)
		if rawName == "" || rawName == "Unknown Item" {
			skipped = append(skipped, rawName)
			continue
		}

		res, ok := ingredients.Resolve(rawName)
		if !ok {
			skipped = append(skipped, rawName)
			continue
		}

		item.Name = res.Ingredient.Name
		item.IngredientID = res.Ingredient.IngredientID
		item.FoodGroup = res.Ingredient.FoodGroup
		if strings.TrimSpace(item.Unit) == "" {
			item.Unit = units.Normalize(res.Ingredient.DefaultUnit)
		}
		matched = append(matched, item)
	}
	return matched, skipped
}
