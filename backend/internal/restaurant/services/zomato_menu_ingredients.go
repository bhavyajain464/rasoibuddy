package services

import (
	"context"
	"fmt"
	"strings"

	consumersvc "kitchenai-backend/internal/services"
	"kitchenai-backend/pkg/config"
)

var fallbackDishIngredients = []string{
	"onion", "tomato", "ginger garlic paste", "turmeric", "coriander powder",
}

func normalizeDishName(name string) string {
	return consumersvc.NormalizeMenuDishName(name)
}

func attachDishIngredientsFromGroq(ctx context.Context, cfg *config.Config, dishes []ZomatoMenuDish) []string {
	if len(dishes) == 0 {
		return nil
	}

	var warnings []string
	if cfg == nil || !cfg.HasGroqAPIKey() {
		for i := range dishes {
			dishes[i].Ingredients = append([]string(nil), fallbackDishIngredients...)
		}
		return []string{"groq not configured; used fallback ingredients for all dishes"}
	}

	input := make([]consumersvc.MenuDishIngredientInput, 0, len(dishes))
	for _, dish := range dishes {
		name := strings.TrimSpace(dish.Name)
		if name == "" {
			continue
		}
		input = append(input, consumersvc.MenuDishIngredientInput{
			Name:     name,
			Category: dish.Category,
		})
	}

	lookup, err := consumersvc.GroqMenuDishIngredients(ctx, cfg, input)
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("groq menu ingredients: %v", err))
		for i := range dishes {
			dishes[i].Ingredients = append([]string(nil), fallbackDishIngredients...)
		}
		return warnings
	}

	missing := 0
	for i := range dishes {
		key := normalizeDishName(dishes[i].Name)
		if ings, ok := lookup[key]; ok && len(ings) > 0 {
			dishes[i].Ingredients = ings
			continue
		}
		missing++
		dishes[i].Ingredients = append([]string(nil), fallbackDishIngredients...)
	}
	if missing > 0 {
		warnings = append(warnings, fmt.Sprintf("fallback ingredients for %d dish(es) without groq match", missing))
	}
	return warnings
}
