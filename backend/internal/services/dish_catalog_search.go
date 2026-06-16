package services

import "strings"

// DishCatalogSearchItem is the API shape for the dish picker.
type DishCatalogSearchItem struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	MealTypes    []string `json:"meal_types"`
	Cuisine      string   `json:"cuisine"`
	CookTimeMins int      `json:"cook_time_mins"`
}

const defaultDishSearchLimit = 120

func normDishSearch(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func dishCatalogSearchItem(d CatalogDish) DishCatalogSearchItem {
	name := d.DisplayLabel()
	if name == "" {
		name = strings.TrimSpace(d.Name)
	}
	return DishCatalogSearchItem{
		ID:           strings.TrimSpace(d.ID),
		Name:         name,
		MealTypes:    append([]string(nil), d.MealType...),
		Cuisine:      strings.TrimSpace(d.Cuisine),
		CookTimeMins: d.CookTimeMinutes,
	}
}

func dishMatchesQuery(item DishCatalogSearchItem, q string) bool {
	if q == "" {
		return true
	}
	return strings.Contains(normDishSearch(item.Name), q) ||
		strings.Contains(normDishSearch(item.ID), q) ||
		strings.Contains(normDishSearch(item.Cuisine), q)
}

func dishesForMealSlot(catalog []DishCatalogSearchItem, mealSlot string) []DishCatalogSearchItem {
	slot := normDishSearch(mealSlot)
	if slot == "" {
		return catalog
	}
	matches := make([]DishCatalogSearchItem, 0, len(catalog)/3)
	for _, d := range catalog {
		for _, t := range d.MealTypes {
			if normDishSearch(t) == slot {
				matches = append(matches, d)
				break
			}
		}
	}
	if len(matches) > 0 {
		return matches
	}
	return catalog
}

// SearchDishCatalog filters the DB-backed dish catalog for the picker UI.
func SearchDishCatalog(query, mealSlot string, limit int) []DishCatalogSearchItem {
	if limit <= 0 {
		limit = defaultDishSearchLimit
	}
	all := DishCatalog()
	pool := make([]DishCatalogSearchItem, 0, len(all))
	for _, d := range all {
		pool = append(pool, dishCatalogSearchItem(d))
	}
	return searchDishCatalogItems(pool, query, mealSlot, limit)
}

func searchDishCatalogItems(pool []DishCatalogSearchItem, query, mealSlot string, limit int) []DishCatalogSearchItem {
	pool = dishesForMealSlot(pool, mealSlot)

	q := normDishSearch(query)
	if q == "" {
		if len(pool) > limit {
			return pool[:limit]
		}
		return pool
	}

	matches := make([]DishCatalogSearchItem, 0, limit)
	for _, item := range pool {
		if len(matches) >= limit {
			break
		}
		if dishMatchesQuery(item, q) {
			matches = append(matches, item)
		}
	}
	if len(matches) > 0 || mealSlot == "" {
		return matches
	}
	for _, item := range pool {
		if len(matches) >= limit {
			break
		}
		if dishMatchesQuery(item, q) {
			matches = append(matches, item)
		}
	}
	return matches
}

// LookupCatalogDish resolves by dish id or display/name (same rules as meal enrichment).
func LookupCatalogDish(dishID, dishName string) (DishCatalogSearchItem, bool) {
	if id := strings.TrimSpace(dishID); id != "" {
		if d, ok := FindCatalogDishByID(id); ok {
			return dishCatalogSearchItem(d), true
		}
	}
	if name := strings.TrimSpace(dishName); name != "" {
		if d, ok := FindCatalogDishByName(name); ok {
			return dishCatalogSearchItem(d), true
		}
	}
	return DishCatalogSearchItem{}, false
}
