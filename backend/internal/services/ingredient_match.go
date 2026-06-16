package services

import (
	"context"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
	"kitchenai-backend/internal/services/ingredients"
)

// DishIngredientMatch is the inventory coverage of a dish's ingredient list.
type DishIngredientMatch struct {
	Have     []string
	Missing  []string
	Staples  []string
	Coverage float64
}

func normIngredient(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// IngredientsMatch reports whether two grocery names refer to the same ingredient (display-level).
func IngredientsMatch(a, b string) bool {
	left := normIngredient(a)
	right := normIngredient(b)
	if left == "" || right == "" {
		return false
	}
	return left == right || strings.Contains(left, right) || strings.Contains(right, left)
}

// InventoryItemsUsedByDish returns pantry item names that overlap dish key_ingredients (display).
func InventoryItemsUsedByDish(dish CatalogDish, inventoryNames []string) []string {
	if len(inventoryNames) == 0 {
		return nil
	}
	seen := map[string]bool{}
	var used []string
	for _, inv := range inventoryNames {
		name := strings.TrimSpace(inv)
		if name == "" || seen[strings.ToLower(name)] {
			continue
		}
		for _, ing := range dish.CatalogIngredients() {
			if IngredientsMatch(name, ing) {
				seen[strings.ToLower(name)] = true
				used = append(used, name)
				break
			}
		}
	}
	return used
}

// BuildHaveIngredientSet collects ingredient ids from pantry rows and/or names (via DB lookup).
func BuildHaveIngredientSet(ingredientIDs []string, inventoryNames []string) map[string]bool {
	out := map[string]bool{}
	for _, id := range ingredientIDs {
		if id = strings.TrimSpace(id); id != "" {
			out[id] = true
		}
	}
	conn := catalogdb.DB()
	if conn == nil {
		return out
	}
	ctx := context.Background()

	uniqNames := make([]string, 0, len(inventoryNames))
	seenNames := map[string]bool{}
	for _, name := range inventoryNames {
		name = strings.TrimSpace(name)
		if name == "" || seenNames[name] {
			continue
		}
		seenNames[name] = true
		uniqNames = append(uniqNames, name)
	}
	if len(uniqNames) == 0 {
		return out
	}

	exactFound := map[string]bool{}
	if hits, err := catalogdb.LookupIngredientsByExactNames(ctx, conn, uniqNames); err == nil {
		for name, hit := range hits {
			out[hit.IngredientID] = true
			exactFound[name] = true
		}
	}
	for _, name := range uniqNames {
		if exactFound[name] {
			continue
		}
		hit, ok, err := catalogdb.LookupIngredient(ctx, conn, name)
		if err == nil && ok {
			out[hit.IngredientID] = true
		}
	}
	return out
}

// MatchDishToInventory compares dish_ingredients in Postgres against kitchen ingredient ids.
func MatchDishToInventory(dish CatalogDish, haveIngredientIDs map[string]bool) DishIngredientMatch {
	if dish.ID == "" || catalogdb.DB() == nil {
		return DishIngredientMatch{Coverage: 1.0}
	}
	dbMatch, err := catalogdb.MatchDishToInventory(context.Background(), catalogdb.DB(), dish.ID, haveIngredientIDs)
	if err != nil {
		return DishIngredientMatch{Coverage: 1.0}
	}
	return DishIngredientMatch{
		Have:     dbMatch.Have,
		Missing:  dbMatch.Missing,
		Staples:  dbMatch.Staples,
		Coverage: dbMatch.Coverage,
	}
}

// ShoppingListHasItem reports whether item matches any name on the active shopping list.
func ShoppingListHasItem(item string, listNames []string) bool {
	for _, name := range listNames {
		if ingredients.SameIngredient(item, name) {
			return true
		}
	}
	return false
}
