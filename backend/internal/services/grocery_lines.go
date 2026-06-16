package services

import "strings"

// IsMultiIngredientDishLabel is true when label resolves to a catalog dish with 2+ recipe ingredients.
func IsMultiIngredientDishLabel(label string) bool {
	dish, ok := FindCatalogDishByPairLabel(label)
	if !ok {
		return false
	}
	return len(dish.CatalogIngredients()) > 1
}

// GroceryIngredientLines keeps pantry shopping lines and drops multi-ingredient dish titles.
func GroceryIngredientLines(lines []string) []string {
	if len(lines) == 0 {
		return nil
	}
	out := make([]string, 0, len(lines))
	seen := map[string]bool{}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || IsMultiIngredientDishLabel(line) {
			continue
		}
		key := strings.ToLower(line)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, titleIngredientToken(line))
	}
	return out
}
