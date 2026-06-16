package ingredients

import "strings"

// SameIngredient reports whether two names refer to the same catalog ingredient.
func SameIngredient(a, b string) bool {
	ra, okA := Resolve(a)
	rb, okB := Resolve(b)
	if okA && okB {
		return ra.Ingredient.IngredientID == rb.Ingredient.IngredientID
	}
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b)) &&
		strings.TrimSpace(a) != ""
}
