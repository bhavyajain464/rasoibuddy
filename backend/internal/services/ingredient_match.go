package services

import (
	"strings"

	"kitchenai-backend/internal/services/ingredients"
)

// commonPantryStaples are assumed to be on hand in any Indian kitchen, so they are not
// reported as "missing" for the shopping-list gap (you don't add salt/water/oil to a cart).
var commonPantryStaples = map[string]bool{
	"salt": true, "water": true, "cooking oil": true, "oil": true, "sugar": true,
	"turmeric powder": true, "red chilli powder": true, "coriander powder": true,
	"cumin powder": true, "garam masala": true, "mustard seeds": true, "cumin seeds": true,
	"asafoetida": true, "black pepper": true, "ghee": true,
}

func normIngredient(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// ingredientInInventory reports whether a dish ingredient is covered by any inventory name.
// Match is word-aware and bidirectional: "onion" matches inventory "Onion", and
// "red chilli powder" matches inventory "chilli powder" (and vice-versa).
// IngredientsMatch reports whether two grocery names refer to the same ingredient.
func IngredientsMatch(a, b string) bool {
	left := normIngredient(a)
	right := normIngredient(b)
	if left == "" || right == "" {
		return false
	}
	return left == right || strings.Contains(left, right) || strings.Contains(right, left)
}

func ingredientInInventory(ingredient string, invTokens map[string]bool, invNames []string) bool {
	ing := normIngredient(ingredient)
	if ing == "" {
		return false
	}
	if invTokens[ing] {
		return true
	}
	for _, raw := range invNames {
		if IngredientsMatch(ingredient, raw) {
			return true
		}
	}
	return false
}

// InventoryItemsUsedByDish returns pantry item names (from inventoryNames) that the dish
// recipe can use, based on full key_ingredients matching.
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

// DishIngredientMatch is the inventory coverage of a dish's ingredient list.
type DishIngredientMatch struct {
	Have     []string // dish ingredients found in inventory
	Missing  []string // dish ingredients not in inventory and not a common staple
	Staples  []string // missing-but-assumed-present (salt/oil/etc.), not shopping-worthy
	Coverage float64  // Have / (Have + Missing), ignoring staples; 1.0 = fully cookable now
}

// MatchDishToInventory splits a dish's key_ingredients into have / missing / staples against
// the user's inventory names. This is the shared primitive for (a) ranking dishes by how
// cookable-now they are and (b) building a shopping list of only the ingredients you lack.
func MatchDishToInventory(dish CatalogDish, inventoryNames []string) DishIngredientMatch {
	invTokens := map[string]bool{}
	for _, n := range inventoryNames {
		invTokens[normIngredient(n)] = true
	}
	var res DishIngredientMatch
	for _, ing := range dish.CatalogIngredients() {
		ni := normIngredient(ing)
		if ni == "" {
			continue
		}
		switch {
		case ingredientInInventory(ni, invTokens, inventoryNames):
			res.Have = append(res.Have, ni)
		case commonPantryStaples[ni]:
			res.Staples = append(res.Staples, ni)
		default:
			res.Missing = append(res.Missing, ni)
		}
	}
	denom := len(res.Have) + len(res.Missing)
	if denom > 0 {
		res.Coverage = float64(len(res.Have)) / float64(denom)
	} else {
		res.Coverage = 1.0
	}
	return res
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
