package services

import "testing"

func TestInventoryItemsUsedByDish(t *testing.T) {
	dish := CatalogDish{
		KeyIngredients: []string{"potato", "onion", "tomato", "green peas", "turmeric powder"},
	}
	used := InventoryItemsUsedByDish(dish, []string{"Potato", "Spinach", "Tomato"})
	if len(used) != 2 {
		t.Fatalf("expected 2 pantry items used, got %v", used)
	}
}

func TestDailyRetrievalIgnoresInventory(t *testing.T) {
	potatoDish := CatalogDish{
		Name:           "aloo matar daily test",
		Diet:           "vegetarian",
		MealType:       []string{"lunch", "dinner"},
		KeyIngredients: []string{"potato", "green peas"},
	}
	scoreWithInv := scoreDish(potatoDish, buildUserFeatureVector(DishRetrieveInput{
		Category:       "daily",
		InventoryNames: []string{"Potato"},
	}), DishRetrieveInput{Category: "daily", InventoryNames: []string{"Potato"}})
	scoreNoInv := scoreDish(potatoDish, buildUserFeatureVector(DishRetrieveInput{
		Category: "daily",
	}), DishRetrieveInput{Category: "daily"})
	if scoreWithInv != scoreNoInv {
		t.Fatalf("daily should not change score with inventory, got %v vs %v", scoreWithInv, scoreNoInv)
	}
}

func TestRescueRetrievalPrefersExpiringOverlap(t *testing.T) {
	potatoDish := CatalogDish{
		Name:           "aloo matar test",
		Diet:           "vegetarian",
		MealType:       []string{"lunch", "dinner"},
		KeyIngredients: []string{"potato", "green peas", "onion", "tomato"},
		Effort:         "low",
		CookTimeMinutes: 25,
	}
	plainDish := CatalogDish{
		Name:           "plain rice test",
		Diet:           "vegetarian",
		MealType:       []string{"lunch", "dinner"},
		KeyIngredients: []string{"rice", "ghee", "salt"},
		Effort:         "low",
		CookTimeMinutes: 20,
	}

	scorePotato := scoreDish(potatoDish, map[string]float64{}, DishRetrieveInput{
		Category:       "rescue_meal",
		InventoryNames: []string{"Potato", "Rice"},
		ExpiringNames:  []string{"Potato"},
	})
	scorePlain := scoreDish(plainDish, map[string]float64{}, DishRetrieveInput{
		Category:       "rescue_meal",
		InventoryNames: []string{"Potato", "Rice"},
		ExpiringNames:  []string{"Potato"},
	})
	if scorePotato <= scorePlain {
		t.Fatalf("expected potato dish to outrank plain rice for expiring potato, got %v vs %v", scorePotato, scorePlain)
	}
}
