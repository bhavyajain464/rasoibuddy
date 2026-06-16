package services

import (
	"context"
	"sort"
	"strings"

	"kitchenai-backend/internal/services/catalogdb"
)

// FindCatalogDishByPairLabel resolves a pairs_with catalog string to a dish row.
// Prefers registered aliases; then exact id/name matches; handles composites (roti / chapati).
func FindCatalogDishByPairLabel(pair string) (CatalogDish, bool) {
	pair = strings.TrimSpace(pair)
	if pair == "" {
		return CatalogDish{}, false
	}

	if ref, ok := lookupRegisteredPairLabel(pair); ok && ref.Kind == catalogdb.PairRefDish {
		if d, ok := FindCatalogDishByID(ref.ID); ok {
			return d, true
		}
	}

	if d, ok := findCatalogDishByPairExact(pair); ok {
		return d, true
	}

	parts := splitPairLabel(pair)
	sort.Slice(parts, func(i, j int) bool {
		return len(parts[i]) > len(parts[j])
	})
	for _, part := range parts {
		if ref, ok := lookupRegisteredPairLabel(part); ok && ref.Kind == catalogdb.PairRefDish {
			if d, ok := FindCatalogDishByID(ref.ID); ok {
				return d, true
			}
		}
		if d, ok := findCatalogDishByPairExact(part); ok {
			return d, true
		}
	}

	// Multi-word labels may match a catalog display name (e.g. jeera rice).
	if strings.Contains(pair, " ") && !strings.Contains(pair, "/") {
		if d, ok := FindCatalogDishByName(pair); ok {
			return d, true
		}
	}
	for _, part := range parts {
		if strings.Contains(part, " ") {
			if d, ok := FindCatalogDishByName(part); ok {
				return d, true
			}
		}
	}
	return CatalogDish{}, false
}

func lookupRegisteredPairLabel(label string) (catalogdb.PairRef, bool) {
	label = strings.TrimSpace(label)
	if label == "" {
		return catalogdb.PairRef{}, false
	}
	registry, err := catalogdb.CachedPairLabelRegistry(context.Background())
	if err != nil || len(registry) == 0 {
		return catalogdb.PairRef{}, false
	}
	ref, ok := registry[label]
	return ref, ok
}

func findCatalogDishByPairExact(label string) (CatalogDish, bool) {
	label = strings.TrimSpace(label)
	if label == "" {
		return CatalogDish{}, false
	}
	if d, ok := FindCatalogDishByID(label); ok {
		return d, true
	}
	slug := strings.ToLower(strings.ReplaceAll(label, " ", "-"))
	if d, ok := FindCatalogDishByID(slug); ok {
		return d, true
	}
	key := NormalizeDishName(label)
	for _, d := range DishCatalog() {
		for _, candidate := range []string{d.ID, d.Name, d.DisplayLabel()} {
			c := strings.TrimSpace(candidate)
			if c == "" {
				continue
			}
			if NormalizeDishName(c) == key {
				return d, true
			}
		}
	}
	return CatalogDish{}, false
}

func splitPairLabel(pair string) []string {
	pair = strings.TrimSpace(pair)
	if pair == "" {
		return nil
	}
	if !strings.Contains(pair, "/") {
		return []string{pair}
	}
	raw := strings.Split(pair, "/")
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{pair}
	}
	return out
}

func displayIngredientLine(line IngredientLine) IngredientLine {
	return IngredientLine{
		IngredientID: strings.TrimSpace(line.IngredientID),
		Name:         titleIngredientToken(line.Name),
	}
}

func lookupCatalogIngredient(raw string) (IngredientLine, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return IngredientLine{}, false
	}
	conn := catalogdb.DB()
	if conn == nil {
		return IngredientLine{}, false
	}
	hit, ok, err := catalogdb.LookupIngredient(context.Background(), conn, raw)
	if err != nil || !ok {
		return IngredientLine{}, false
	}
	return IngredientLine{
		IngredientID: hit.IngredientID,
		Name:         hit.CanonicalName,
	}, true
}

// CatalogIngredientLinesForPairLabel returns catalog-backed ingredients for one pairs_with label or id.
func CatalogIngredientLinesForPairLabel(pair string) []IngredientLine {
	pair = strings.TrimSpace(pair)
	if pair == "" {
		return nil
	}
	if ref, ok := lookupRegisteredPairLabel(pair); ok {
		switch ref.Kind {
		case catalogdb.PairRefDish:
			if dish, ok := FindCatalogDishByID(ref.ID); ok {
				return dishIngredientLines(dish)
			}
		case catalogdb.PairRefIngredient:
			if line, ok := ingredientLineByID(ref.ID); ok {
				return []IngredientLine{displayIngredientLine(line)}
			}
		}
	}
	if dish, ok := FindCatalogDishByID(pair); ok {
		return dishIngredientLines(dish)
	}
	if line, ok := ingredientLineByID(pair); ok {
		return []IngredientLine{displayIngredientLine(line)}
	}
	if dish, ok := FindCatalogDishByPairLabel(pair); ok {
		return dishIngredientLines(dish)
	}

	raw := pair
	names := expandCompoundGrocery(raw)
	out := make([]IngredientLine, 0, len(names))
	seen := map[string]bool{}
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		line, ok := lookupCatalogIngredient(n)
		if !ok {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(line.IngredientID))
		if key == "" {
			key = strings.ToLower(strings.TrimSpace(line.Name))
		}
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, displayIngredientLine(line))
	}
	if len(out) == 0 {
		if line, ok := lookupCatalogIngredient(raw); ok {
			return []IngredientLine{displayIngredientLine(line)}
		}
		return nil
	}
	return out
}

// CatalogIngredientsForPairLabel returns display names for one pairs_with label.
func CatalogIngredientsForPairLabel(pair string) []string {
	return IngredientLineNames(CatalogIngredientLinesForPairLabel(pair))
}

// PairIngredientsMap maps each pairs_with label to catalog-derived ingredients for the API.
func PairIngredientsMap(pairLabels []string) PairIngredientLinesMap {
	if len(pairLabels) == 0 {
		return nil
	}
	out := make(PairIngredientLinesMap, len(pairLabels))
	for _, label := range pairLabels {
		label = strings.TrimSpace(label)
		if label == "" {
			continue
		}
		key := PairDisplayLabel(label)
		out[key] = CatalogIngredientLinesForPairLabel(label)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func dishIngredientLines(dish CatalogDish) []IngredientLine {
	lines := dish.CatalogIngredientLines()
	if len(lines) == 0 {
		return nil
	}
	out := make([]IngredientLine, len(lines))
	for i, line := range lines {
		out[i] = displayIngredientLine(line)
	}
	return out
}
