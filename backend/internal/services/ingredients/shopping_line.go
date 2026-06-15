package ingredients

import (
	"strings"

	"kitchenai-backend/pkg/units"
)

// Typical buy qty for catalog ingredients (how people shop, not recipe amounts).
var purchaseQtyByID = map[string]float64{
	"lemon":      2,
	"lime":       2,
	"egg":        6,
	"watermelon": 1,
	"muskmelon":  1,
	"papaya":     1,
	"pineapple":  1,
	"jackfruit":  1,
	"kiwi":       4,
	"avocado":    2,
	"coconut":    1,
	"banana":     6,
}

// DefaultPurchaseQty picks a realistic starter amount when qty is missing on a shopping line.
func DefaultPurchaseQty(item *CatalogIngredient, unit string) float64 {
	unit = units.Normalize(unit)
	if item != nil {
		id := strings.TrimSpace(item.IngredientID)
		if q, ok := purchaseQtyByID[id]; ok {
			return q
		}
		fg := strings.TrimSpace(item.FoodGroup)
		switch unit {
		case "g":
			if fg == "spices" {
				return 100
			}
			return 250
		case "ml":
			return 500
		case "kg", "L":
			return 1
		case "pcs":
			if fg == "fruits" {
				return 2
			}
			if id == "egg" {
				return 6
			}
			if fg == "spices" {
				return 1
			}
			return 2
		}
	}

	switch unit {
	case "g":
		return 250
	case "ml":
		return 500
	case "pcs":
		return 2
	case "kg", "L":
		return 1
	default:
		return 1
	}
}

// DefaultShoppingQty picks a starter amount when qty is missing (unit-only fallback).
func DefaultShoppingQty(unit string) float64 {
	return DefaultPurchaseQty(nil, unit)
}

// NormalizeShoppingLine resolves catalog name/unit and fills a default qty when unset.
func NormalizeShoppingLine(name string, qty float64, unit string) (string, float64, string) {
	name = strings.TrimSpace(name)
	unit = units.Normalize(unit)
	if qty < 0 {
		qty = 0
	}
	var match *CatalogIngredient
	if name != "" {
		if res, ok := Resolve(name); ok {
			match = &res.Ingredient
			name = match.Name
			unit = units.Normalize(match.DefaultUnit)
		}
	}
	if qty <= 0 {
		qty = DefaultPurchaseQty(match, unit)
	}
	return name, qty, unit
}
