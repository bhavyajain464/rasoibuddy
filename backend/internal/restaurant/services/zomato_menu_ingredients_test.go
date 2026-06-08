package services

import (
	"context"
	"testing"

	"kitchenai-backend/pkg/config"
)

func TestAttachDishIngredientsFromGroqFallbackWithoutKey(t *testing.T) {
	dishes := []ZomatoMenuDish{{Name: "Dal Fry", Category: "main course"}}
	warns := attachDishIngredientsFromGroq(context.Background(), &config.Config{}, dishes)
	if len(warns) == 0 {
		t.Fatal("expected warning")
	}
	if len(dishes[0].Ingredients) != len(fallbackDishIngredients) {
		t.Fatalf("expected fallback ingredients, got %v", dishes[0].Ingredients)
	}
}
