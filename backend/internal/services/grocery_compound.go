package services

import "strings"

// Typical Indian home shopping names for compound catalog ingredients.
var compoundGroceryExpansions = map[string][]string{
	"mixed vegetables":     {"carrot", "french beans", "cauliflower", "green peas", "capsicum", "beans"},
	"mixed vegetable":      {"carrot", "french beans", "cauliflower", "green peas", "capsicum", "beans"},
	"mixed veg":            {"carrot", "french beans", "cauliflower", "green peas", "capsicum"},
	"whole spices":         {"cumin seeds", "coriander seeds", "bay leaf", "cinnamon", "cloves", "cardamom"},
	"mixed vegetables frozen": {"carrot", "french beans", "green peas", "corn"},
}

// blockedShoppingNames are never valid single-line shopping suggestions.
var blockedShoppingNames = map[string]bool{
	"mixed vegetables":  true,
	"mixed vegetable":   true,
	"mixed veg":         true,
	"whole spices":      true,
	"spices":            true,
	"vegetables":        true,
	"mixed vegetables frozen": true,
}

func normalizeCompoundKey(s string) string {
	return NormalizeDishName(s)
}

// expandCompoundGrocery splits bundle ingredients into items you can buy individually.
func expandCompoundGrocery(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	key := normalizeCompoundKey(raw)
	if expanded, ok := compoundGroceryExpansions[key]; ok {
		return expanded
	}
	for phrase, items := range compoundGroceryExpansions {
		if strings.Contains(key, phrase) || strings.Contains(phrase, key) {
			return items
		}
	}
	return []string{raw}
}

func isBlockedShoppingName(name string) bool {
	key := normalizeCompoundKey(name)
	if blockedShoppingNames[key] {
		return true
	}
	for blocked := range blockedShoppingNames {
		if key == blocked || strings.Contains(key, blocked) {
			return true
		}
	}
	return false
}

// expandOrderSuggestNames turns one AI/catalog line into concrete grocery names.
func expandOrderSuggestNames(name string) []string {
	name = strings.TrimSpace(name)
	if name == "" || isBlockedShoppingName(name) {
		expanded := expandCompoundGrocery(name)
		if len(expanded) > 0 && expanded[0] != name {
			out := make([]string, 0, len(expanded))
			for _, e := range expanded {
				if !isBlockedShoppingName(e) {
					out = append(out, titleIngredientToken(e))
				}
			}
			return out
		}
		return nil
	}
	expanded := expandCompoundGrocery(name)
	if len(expanded) == 1 && normalizeCompoundKey(expanded[0]) == normalizeCompoundKey(name) {
		return []string{titleIngredientToken(name)}
	}
	out := make([]string, 0, len(expanded))
	seen := map[string]bool{}
	for _, e := range expanded {
		e = titleIngredientToken(e)
		k := normalizeCompoundKey(e)
		if k == "" || seen[k] || isBlockedShoppingName(e) {
			continue
		}
		seen[k] = true
		out = append(out, e)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
