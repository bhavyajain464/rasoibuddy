package services

import "testing"

func TestRetrieveDishesVegetarianFiltersNonVeg(t *testing.T) {
	in := DishRetrieveInput{
		Category:    "daily",
		DietaryTags: []string{"vegetarian"},
		FavCuisines: []string{"North Indian"},
		TopK:        30,
	}
	ranked := RetrieveDishes(in)
	if len(ranked) == 0 {
		t.Fatal("expected candidates")
	}
	for _, r := range ranked {
		diet := r.Dish.NormalizedDiet()
		if diet == "non-veg" || diet == "eggetarian" {
			t.Fatalf("non-veg/eggetarian dish in veg results: %s (%s)", r.Dish.Name, diet)
		}
	}
}

func TestRetrieveDishesMealOfDayUsesMealType(t *testing.T) {
	in := DishRetrieveInput{
		Category:    "meal_of_day",
		DietaryTags: []string{"vegetarian"},
		TopK:        30,
	}
	ranked := RetrieveDishes(in)
	if len(ranked) == 0 {
		t.Fatal("expected candidates")
	}
	for _, r := range ranked {
		if !DishMatchesUICategory(r.Dish, "meal_of_day") {
			t.Fatalf("expected main-meal slot, got %s meal_type=%v", r.Dish.Name, r.Dish.MealType)
		}
	}
}

func TestDishAllowedForUserDiet(t *testing.T) {
	vegan := CatalogDish{Diet: "vegan"}
	veg := CatalogDish{Diet: "vegetarian"}
	egg := CatalogDish{Diet: "eggetarian"}
	non := CatalogDish{Diet: "non-veg"}

	if !DishAllowedForUserDiet(vegan, []string{"vegan"}) {
		t.Fatal("vegan dish should match vegan")
	}
	if DishAllowedForUserDiet(egg, []string{"vegan"}) {
		t.Fatal("eggetarian should not match vegan")
	}
	if !DishAllowedForUserDiet(veg, []string{"vegetarian"}) {
		t.Fatal("vegetarian dish should match vegetarian")
	}
	if DishAllowedForUserDiet(non, []string{"vegetarian"}) {
		t.Fatal("non-veg should not match vegetarian")
	}
	if DishAllowedForUserDiet(egg, []string{"vegetarian"}) {
		t.Fatal("eggetarian should not match vegetarian")
	}
}
