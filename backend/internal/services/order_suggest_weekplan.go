package services

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"kitchenai-backend/internal/services/catalogdb"
	"kitchenai-backend/internal/services/ingredients"
)

var ErrOrderSuggestNoPlan = errors.New("no week meal plan for suggestions")

// OrderSuggestCacheSize is how many ranked items the API keeps in the suggestion pool.
const OrderSuggestCacheSize = 12

// SuggestOrderItemsFromWeekPlan returns missing ingredients for planned meals (same basis as week-plan "Need to order").
func SuggestOrderItemsFromWeekPlan(in OrderSuggestInput) (OrderSuggestResult, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if in.WeekPlan == nil || len(in.WeekPlan.Days) == 0 {
		return OrderSuggestResult{}, ErrOrderSuggestNoPlan
	}

	inv := append([]string{}, in.Inventory...)
	shopping := append([]string{}, in.ShoppingList...)
	have := BuildHaveIngredientSet(in.InventoryIngredientIDs, inv)
	dishLines := loadOrderSuggestDishLines(in.WeekPlan)

	ingScores := map[string]*scoredStaple{}
	for _, day := range in.WeekPlan.Days {
		dishLabel := strings.TrimSpace(day.Date)
		for _, meal := range day.Category.Meals {
			name := strings.TrimSpace(meal.Name)
			if name == "" {
				continue
			}
			source := name
			if dishLabel != "" {
				source = fmt.Sprintf("%s (%s)", name, dishLabel)
			}
			for _, ing := range orderSuggestIngredientsForMeal(meal, have, dishLines) {
				if onShoppingList(ing, shopping) {
					continue
				}
				scoreOrderSuggestIngredient(ing, source, 1, ingScores)
			}
		}
	}

	var missing []scoredStaple
	for _, s := range ingScores {
		missing = append(missing, *s)
	}
	sort.Slice(missing, func(i, j int) bool {
		if missing[i].Score != missing[j].Score {
			return missing[i].Score > missing[j].Score
		}
		return missing[i].Name < missing[j].Name
	})

	items := make([]OrderSuggestItem, 0, OrderSuggestCacheSize)
	for _, s := range missing {
		if len(items) >= OrderSuggestCacheSize {
			break
		}
		reason := formatOrderSuggestReason(s.Sources)
		items = append(items, finalizeOrderSuggestItem(s.Name, reason))
	}

	summary := "Nothing to order — your pantry covers the next 7 days of planned meals."
	source := "empty"
	if len(items) > 0 {
		summary = "Ingredients to order for your next 7 days of planned meals."
		source = "week_plan"
	}

	return OrderSuggestResult{
		Items:       items,
		Summary:     summary,
		Source:      source,
		GeneratedAt: now,
	}, nil
}

func collectWeekPlanDishIDs(plan *WeekPlanEntry) []string {
	if plan == nil {
		return nil
	}
	seen := map[string]struct{}{}
	var ids []string
	for _, day := range plan.Days {
		for _, meal := range day.Category.Meals {
			id := strings.TrimSpace(meal.DishID)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	return ids
}

func loadOrderSuggestDishLines(plan *WeekPlanEntry) map[string][]catalogdb.DishIngredientRow {
	conn := catalogdb.DB()
	if conn == nil {
		return nil
	}
	ids := collectWeekPlanDishIDs(plan)
	if len(ids) == 0 {
		return nil
	}
	lines, err := catalogdb.LoadDishIngredientsByIDs(context.Background(), conn, ids)
	if err != nil {
		return nil
	}
	return lines
}

// orderSuggestIngredientsForMeal mirrors week-plan UI: missing recipe ingredients only (not dish titles).
func orderSuggestIngredientsForMeal(
	meal CachedSmartMeal,
	have map[string]bool,
	dishLines map[string][]catalogdb.DishIngredientRow,
) []string {
	if dishID := strings.TrimSpace(meal.DishID); dishID != "" {
		if rows, ok := dishLines[dishID]; ok && len(rows) > 0 {
			return catalogdb.MatchDishIngredientRowsToInventory(rows, have).Missing
		}
		if dish, ok := FindCatalogDishByID(dishID); ok {
			return MatchDishToInventory(dish, have).Missing
		}
	}
	if dish, ok := FindCatalogDishByName(meal.Name); ok {
		return MatchDishToInventory(dish, have).Missing
	}
	source := meal.Ingredients
	if len(source) == 0 {
		source = GroceryIngredientLines(meal.ItemsToOrder)
	}
	return missingIngredientsByName(source, have)
}

func missingIngredientsByName(names []string, have map[string]bool) []string {
	if len(names) == 0 {
		return nil
	}
	conn := catalogdb.DB()
	if conn == nil {
		return names
	}
	var missing []string
	ctx := context.Background()
	for _, raw := range names {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		hit, ok, err := catalogdb.LookupIngredient(ctx, conn, raw)
		if err == nil && ok && have[hit.IngredientID] {
			continue
		}
		missing = append(missing, raw)
	}
	return missing
}

func onShoppingList(item string, listNames []string) bool {
	for _, name := range listNames {
		if ingredients.SameIngredient(item, name) {
			return true
		}
	}
	return false
}

func scoreOrderSuggestIngredient(raw, source string, weight int, ingScores map[string]*scoredStaple) {
	raw = strings.TrimSpace(raw)
	if raw == "" || weight <= 0 {
		return
	}
	if strings.Contains(raw, "/") && !strings.Contains(raw, " ") {
		return
	}
	names := expandCompoundGrocery(raw)
	for _, part := range names {
		part = strings.TrimSpace(part)
		if part == "" || isBlockedShoppingName(part) {
			continue
		}
		key := NormalizeDishName(part)
		if key == "" {
			continue
		}
		display := titleIngredientToken(part)
		if s, ok := ingScores[key]; ok {
			s.Score += weight
			if len(s.Sources) < 3 && !containsString(s.Sources, source) {
				s.Sources = append(s.Sources, source)
			}
		} else {
			ingScores[key] = &scoredStaple{Name: display, Score: weight, Sources: []string{source}}
		}
	}
}

func formatOrderSuggestReason(sources []string) string {
	if len(sources) == 0 {
		return "For your planned meals"
	}
	labels := make([]string, 0, len(sources))
	seen := map[string]bool{}
	for _, src := range sources {
		src = strings.TrimSpace(src)
		if src == "" {
			continue
		}
		if idx := strings.Index(src, " ("); idx > 0 {
			src = src[:idx]
		}
		key := NormalizeDishName(src)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		labels = append(labels, src)
		if len(labels) >= 2 {
			break
		}
	}
	if len(labels) == 0 {
		return "For your planned meals"
	}
	if len(labels) == 1 {
		return "For " + labels[0]
	}
	return "For " + labels[0] + ", " + labels[1]
}

func finalizeOrderSuggestItem(rawName, reason string) OrderSuggestItem {
	name, qty, unit := ingredients.NormalizeShoppingLine(rawName, 0, "pcs")
	return OrderSuggestItem{
		Name:   name,
		Qty:    qty,
		Unit:   unit,
		Reason: reason,
	}
}
