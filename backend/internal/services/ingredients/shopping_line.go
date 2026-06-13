package ingredients

import (
	"strings"

	"kitchenai-backend/pkg/units"
)

// DefaultShoppingQty picks a starter amount when qty is missing on a shopping line.
func DefaultShoppingQty(unit string) float64 {
	switch units.Normalize(unit) {
	case "g":
		return 250
	case "ml":
		return 500
	case "pcs":
		return 10
	case "kg", "L":
		return 1
	default:
		return 1
	}
}

// NormalizeShoppingLine resolves catalog name/unit and fills a default qty when unset.
func NormalizeShoppingLine(name string, qty float64, unit string) (string, float64, string) {
	name = strings.TrimSpace(name)
	unit = units.Normalize(unit)
	if qty < 0 {
		qty = 0
	}
	if name != "" {
		if match, ok := Resolve(name); ok {
			name = match.Ingredient.Name
			unit = units.Normalize(match.Ingredient.DefaultUnit)
		}
	}
	if qty <= 0 {
		qty = DefaultShoppingQty(unit)
	}
	return name, qty, unit
}
