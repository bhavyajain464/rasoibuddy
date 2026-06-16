package services

import (
	"sort"
	"strings"
)

var (
	// ErrOrderSuggestNoMeals is kept for callers/tests that referenced meal-history suggestions.
	ErrOrderSuggestNoMeals = ErrOrderSuggestNoPlan
)

// OrderSuggestItem is one grocery line to buy.
type OrderSuggestItem struct {
	Name   string  `json:"name"`
	Qty    float64 `json:"qty"`
	Unit   string  `json:"unit"`
	Reason string  `json:"reason"`
}

// OrderSuggestResult is the API payload for shopping order suggestions.
type OrderSuggestResult struct {
	Items       []OrderSuggestItem `json:"items"`
	Summary     string             `json:"summary"`
	Source      string             `json:"source"` // ai | empty
	GeneratedAt string             `json:"generated_at"`
}

// OrderSuggestInput gathers household context for order suggestions.
type OrderSuggestInput struct {
	WeekPlan               *WeekPlanEntry
	EatenLog               []CookedLogEntry
	Inventory              []string
	InventoryIngredientIDs []string
	ShoppingList           []string
	DietaryTags            []string
	Allergies              []string
	Dislikes               []string
	FavCuisines            []string
	Memories               []string
	ExcludeItems           []string
}

type frequentDish struct {
	Name  string
	Count int
}

// SuggestOrderItems returns top missing ingredients for the kitchen week plan.
func SuggestOrderItems(in OrderSuggestInput) (OrderSuggestResult, error) {
	return SuggestOrderItemsFromWeekPlan(in)
}

func countFrequentEatenDishes(entries []CookedLogEntry, max int) []frequentDish {
	counts := map[string]int{}
	display := map[string]string{}
	for _, e := range entries {
		name := strings.TrimSpace(e.DishName)
		if name == "" {
			continue
		}
		key := NormalizeDishName(name)
		counts[key]++
		if _, ok := display[key]; !ok {
			display[key] = name
		}
	}
	list := make([]frequentDish, 0, len(counts))
	for key, n := range counts {
		list = append(list, frequentDish{Name: display[key], Count: n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Count != list[j].Count {
			return list[i].Count > list[j].Count
		}
		return list[i].Name < list[j].Name
	})
	if max > 0 && len(list) > max {
		list = list[:max]
	}
	return list
}

func normalizeGroceryToken(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	repl := strings.NewReplacer(",", " ", "(", " ", ")", " ", "'", " ")
	return strings.TrimSpace(repl.Replace(s))
}

func groceryTokens(s string) []string {
	return tokenizeForDishes(s)
}

func titleIngredientToken(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// FindCatalogDishByName matches a cooked dish name to a catalog row.
func FindCatalogDishByName(dishName string) (CatalogDish, bool) {
	key := NormalizeDishName(dishName)
	if key == "" {
		return CatalogDish{}, false
	}
	var best CatalogDish
	bestScore := 0
	for _, d := range DishCatalog() {
		for _, candidate := range []string{NormalizeDishName(d.Name), NormalizeDishName(d.DisplayLabel())} {
			if candidate == "" {
				continue
			}
			if candidate == key {
				return d, true
			}
			score := 0
			if strings.Contains(candidate, key) {
				score = len(key)
			} else if strings.Contains(key, candidate) {
				score = len(candidate)
			}
			if score > bestScore {
				best = d
				bestScore = score
			}
		}
	}
	if bestScore >= 4 {
		return best, true
	}
	return CatalogDish{}, false
}

