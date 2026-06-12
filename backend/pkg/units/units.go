package units

import "strings"

// Canonical units stored in inventory and shopping_items.
var canonical = map[string]struct{}{
	"pcs":   {},
	"kg":    {},
	"g":     {},
	"L":     {},
	"ml":    {},
	"bunch": {}, // leafy greens & fresh herbs (coriander, mint, spinach, methi, curry leaves)
}

var aliases = map[string]string{
	"piece":       "pcs",
	"pieces":      "pcs",
	"pc":          "pcs",
	"nos":         "pcs",
	"no":          "pcs",
	"unit":        "pcs",
	"units":       "pcs",
	"pack":        "pcs",
	"packs":       "pcs",
	"bunches":     "bunch",
	"bundle":      "bunch",
	"gucha":       "bunch",
	"guchcha":     "bunch",
	"gram":        "g",
	"grams":       "g",
	"gm":          "g",
	"kilogram":    "kg",
	"kilograms":   "kg",
	"kgs":         "kg",
	"liter":       "L",
	"litre":       "L",
	"litres":      "L",
	"l":           "L",
	"milliliter":  "ml",
	"milliliters": "ml",
}

// Normalize maps legacy or alias units to canonical ids (pcs, kg, g, L, ml).
func Normalize(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "pcs"
	}
	if _, ok := canonical[trimmed]; ok {
		return trimmed
	}
	key := strings.ToLower(trimmed)
	if _, ok := canonical[key]; ok {
		if key == "l" {
			return "L"
		}
		return key
	}
	if mapped, ok := aliases[key]; ok {
		return mapped
	}
	return trimmed
}
