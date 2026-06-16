package ingredients

import (
	"sort"
	"strings"

	"kitchenai-backend/pkg/units"
)

// CatalogIngredient is one row exposed to the inventory/shopping UI.
type CatalogIngredient struct {
	IngredientID string   `json:"ingredient_id"`
	Name         string   `json:"name"`
	DefaultUnit  string   `json:"default_unit"`
	Units        []string `json:"units,omitempty"`
	FoodGroup    string   `json:"food_group,omitempty"`
	Synonyms     []string `json:"synonyms,omitempty"`
}

// NormalizeUnit ensures API returns canonical unit ids.
func NormalizeUnit(u string) string {
	return units.Normalize(u)
}

func defaultUnitForCategory(category string) string {
	switch strings.TrimSpace(category) {
	case "oils_fats", "beverages", "condiments_sauces":
		return "ml"
	case "vegetables", "leafy_greens", "fruits", "poultry", "meat", "seafood",
		"grains_cereals", "pulses_legumes":
		return "kg"
	case "spices", "spice_blends", "herbs", "flours", "nuts", "seeds", "dry_fruits",
		"baking", "sweeteners", "dairy":
		return "g"
	case "eggs", "staples_packaged", "other":
		return "pcs"
	default:
		return "pcs"
	}
}

func foodGroupForCategory(category string) string {
	switch strings.TrimSpace(category) {
	case "vegetables", "leafy_greens":
		return "vegetables"
	case "fruits":
		return "fruits"
	case "spices", "spice_blends", "herbs":
		return "spices"
	case "dairy", "eggs":
		return "dairy"
	case "grains_cereals", "pulses_legumes", "flours":
		return "grains_pulses"
	case "oils_fats":
		return "oils_fats"
	case "poultry", "meat", "seafood":
		return "non_veg"
	case "condiments_sauces":
		return "condiments"
	case "baking", "staples_packaged":
		return "bakery"
	case "beverages":
		return "beverages"
	default:
		return "other"
	}
}

func normalizeUnitList(raw []string) []string {
	if len(raw) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, u := range raw {
		n := units.Normalize(strings.TrimSpace(u))
		if n == "" {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}
