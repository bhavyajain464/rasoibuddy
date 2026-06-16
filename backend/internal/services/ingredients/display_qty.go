package ingredients

import (
	"fmt"
	"math"
	"strings"

	"kitchenai-backend/pkg/units"
)

// FormatPurchaseQty renders a human-readable qty for lists (e.g. "2" lemons, "1 kg" rice).
func FormatPurchaseQty(qty float64, unit string, item *CatalogIngredient) string {
	u := units.Normalize(unit)
	if item != nil && u == "" {
		u = units.Normalize(item.DefaultUnit)
	}
	if qty <= 0 || math.IsNaN(qty) || math.IsInf(qty, 0) {
		if isCountPurchased(item, u) {
			return ""
		}
		if u != "" {
			return u
		}
		return ""
	}
	if isCountPurchased(item, u) {
		return formatQtyLabel(qty)
	}
	if u == "" {
		return formatQtyLabel(qty)
	}
	return fmt.Sprintf("%s %s", formatQtyLabel(qty), u)
}

func isCountPurchased(item *CatalogIngredient, unit string) bool {
	u := units.Normalize(unit)
	if u != "pcs" {
		return false
	}
	if item == nil {
		return false
	}
	allowed := normalizeUnitList(item.Units)
	if len(allowed) == 0 {
		allowed = []string{units.Normalize(item.DefaultUnit)}
	}
	if len(allowed) != 1 || allowed[0] != "pcs" {
		return false
	}
	id := strings.TrimSpace(item.IngredientID)
	if _, ok := purchaseQtyByID[id]; ok {
		return true
	}
	if id == "egg" {
		return true
	}
	return strings.TrimSpace(item.FoodGroup) == "fruits"
}

func formatQtyLabel(qty float64) string {
	if math.IsNaN(qty) || math.IsInf(qty, 0) {
		return "0"
	}
	rounded := math.Round(qty*100) / 100
	if math.Mod(rounded, 1) == 0 {
		return fmt.Sprintf("%.0f", rounded)
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", rounded), "0"), ".")
}
