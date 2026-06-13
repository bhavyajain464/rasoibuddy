package ingredients

// SameIngredient reports whether two names refer to the same catalog ingredient.
// Manual adds and edits pick from the catalog dropdown, so identity is catalog id when known.
func SameIngredient(a, b string) bool {
	ra, okA := Resolve(a)
	rb, okB := Resolve(b)
	if okA && okB {
		return ra.Ingredient.IngredientID == rb.Ingredient.IngredientID
	}
	if okA {
		return normalizeKey(ra.Ingredient.Name) == normalizeKey(b)
	}
	if okB {
		return normalizeKey(a) == normalizeKey(rb.Ingredient.Name)
	}
	return normalizeKey(a) == normalizeKey(b) && normalizeKey(a) != ""
}
