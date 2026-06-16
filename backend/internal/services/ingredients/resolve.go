package ingredients

import "strings"

// MatchResult is a catalog hit for a free-form grocery name.
type MatchResult struct {
	Ingredient CatalogIngredient
	MatchedVia string
}

// InventoryFieldsFromName maps a free-form grocery name to catalog canonical name and food_group.
// When no catalog match exists, the trimmed input name is kept and food_group is "other".
func InventoryFieldsFromName(name string) (canonicalName, foodGroup string) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", "other"
	}
	if res, ok := Resolve(name); ok {
		canonicalName = strings.TrimSpace(res.Ingredient.Name)
		foodGroup = strings.TrimSpace(res.Ingredient.FoodGroup)
		if canonicalName == "" {
			canonicalName = name
		}
		if foodGroup == "" {
			foodGroup = "other"
		}
		return canonicalName, foodGroup
	}
	return name, "other"
}
