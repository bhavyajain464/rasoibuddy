package services

import (
	"strings"
)

var lentilIngredientTokens = []string{
	"toor dal", "arhar dal", "moong dal", "masoor dal", "urad dal", "chana dal",
	"green moong dal", "yellow moong dal", "sabut masoor dal", "dhuli urad dal",
}

// DishFamily returns the catalog grouping for meal-plan diversity.
// Stored on each dish row in Postgres (dishes.dish_family); defaults to dish id.
func DishFamily(d CatalogDish) string {
	if family := strings.TrimSpace(d.DishFamily); family != "" {
		return family
	}
	if id := strings.TrimSpace(d.ID); id != "" {
		return id
	}
	return strings.TrimSpace(d.Name)
}

func variantStyle(d CatalogDish) string {
	return strings.TrimSpace(d.VariantStyle)
}

func sameVariantGroup(a, b CatalogDish) bool {
	if DishFamily(a) != DishFamily(b) {
		return false
	}
	return variantStyle(a) == variantStyle(b)
}

func primaryLentilToken(d CatalogDish) string {
	for _, ing := range d.CatalogIngredients() {
		lower := strings.ToLower(strings.TrimSpace(ing))
		for _, token := range lentilIngredientTokens {
			if strings.Contains(lower, token) {
				return token
			}
		}
		if strings.Contains(lower, " dal") || strings.HasSuffix(lower, "dal") {
			return lower
		}
	}
	return ""
}

// ExpandExcludeByDishFamilies adds every catalog dish name in families already represented
// in exclude, so the planner treats dal-tadka and masoor-dal as the same weekly slot.
func ExpandExcludeByDishFamilies(exclude []string) []string {
	return expandExcludeByFamilies(DishCatalog(), exclude)
}

func expandExcludeByFamilies(catalog []CatalogDish, exclude []string) []string {
	if len(exclude) == 0 || len(catalog) == 0 {
		return exclude
	}
	families := map[string]struct{}{}
	for _, name := range exclude {
		if d, ok := findCatalogDishByNameIn(catalog, name); ok {
			families[DishFamily(d)] = struct{}{}
			continue
		}
	}
	if len(families) == 0 {
		return exclude
	}

	out := append([]string(nil), exclude...)
	seen := excludeDishSet(exclude)
	for _, d := range catalog {
		if _, ok := families[DishFamily(d)]; !ok {
			continue
		}
		for _, label := range []string{d.Name, d.DisplayLabel()} {
			key := NormalizeDishName(label)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, label)
		}
	}
	return out
}

func findCatalogDishByNameIn(catalog []CatalogDish, dishName string) (CatalogDish, bool) {
	key := NormalizeDishName(dishName)
	if key == "" {
		return CatalogDish{}, false
	}
	for _, d := range catalog {
		for _, candidate := range []string{NormalizeDishName(d.Name), NormalizeDishName(d.DisplayLabel())} {
			if candidate == key {
				return d, true
			}
		}
	}
	return CatalogDish{}, false
}

// ResolveFamilyVariantByInventory swaps a picked dish for the best pantry-matching variant
// within the same dish_family + variant_style (e.g. moong dal tadka when moong dal is on hand).
func ResolveFamilyVariantByInventory(d CatalogDish, inventoryNames, inventoryIDs []string) CatalogDish {
	return resolveFamilyVariantAmong(d, DishCatalog(), inventoryNames, inventoryIDs)
}

func resolveFamilyVariantAmong(d CatalogDish, catalog []CatalogDish, inventoryNames, inventoryIDs []string) CatalogDish {
	have := BuildHaveIngredientSet(inventoryIDs, inventoryNames)

	var candidates []CatalogDish
	for _, candidate := range catalog {
		if sameVariantGroup(d, candidate) {
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) <= 1 {
		return d
	}

	best := d
	bestScore := lentilInventoryScore(d, have, inventoryNames)
	for _, candidate := range candidates {
		score := lentilInventoryScore(candidate, have, inventoryNames)
		if score > bestScore {
			bestScore = score
			best = candidate
		}
	}
	return best
}

func lentilInventoryScore(d CatalogDish, have map[string]bool, inventoryNames []string) int {
	token := primaryLentilToken(d)
	if token == "" {
		return 0
	}
	if ingredientInHaveSet(token, have) {
		return 10
	}
	for _, name := range inventoryNames {
		if IngredientsMatch(name, token) {
			return 10
		}
	}
	for _, part := range strings.Fields(token) {
		if len(part) < 3 {
			continue
		}
		if ingredientInHaveSet(part, have) {
			return 5
		}
	}
	return 0
}

func ingredientInHaveSet(token string, have map[string]bool) bool {
	token = strings.ToLower(strings.TrimSpace(token))
	if token == "" {
		return false
	}
	if _, ok := have[token]; ok {
		return true
	}
	for key, present := range have {
		if !present {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		if strings.Contains(key, token) || strings.Contains(token, key) {
			return true
		}
	}
	return false
}
