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

func TestGlobalStarCountAndRetrievalScore(t *testing.T) {
	d := CatalogDish{Name: "Paneer Butter Masala"}
	global := map[string]int{NormalizeDishName("Paneer Butter Masala"): 12}
	if got := d.GlobalStarCount(global); got != 12 {
		t.Fatalf("expected global stars 12, got %d", got)
	}
	if got := d.GlobalStarCount(nil); got != 0 {
		t.Fatalf("expected 0 global stars, got %d", got)
	}
	if got := d.RetrievalStarScore(global); got != 12 {
		t.Fatalf("expected retrieval score from global stars, got %v", got)
	}
	if got := d.RetrievalStarScore(nil); got != 0 {
		t.Fatalf("expected 0 without global stars, got %v", got)
	}
}

func TestRetrieveDishesSparseInputPrefersGlobalStars(t *testing.T) {
	var pick CatalogDish
	for _, d := range DishCatalog() {
		if d.NormalizedDiet() == "vegetarian" &&
			(d.DishHasMealType("lunch") || d.DishHasMealType("dinner")) {
			pick = d
			break
		}
	}
	if pick.Name == "" {
		t.Fatal("no vegetarian dish in catalog")
	}
	key := NormalizeDishName(pick.Name)
	in := DishRetrieveInput{
		Category:         "daily",
		DietaryTags:      []string{"vegetarian"},
		TopK:             10,
		GlobalStarCounts: map[string]int{key: 100},
	}
	ranked := RetrieveDishes(in)
	if len(ranked) == 0 {
		t.Fatal("expected candidates")
	}
	if NormalizeDishName(ranked[0].Dish.Name) != key {
		t.Fatalf("expected globally starred dish first, got %q", ranked[0].Dish.Name)
	}
}

func TestMealTypeFilterLunchDinnerDefault(t *testing.T) {
	lunch := CatalogDish{Name: "Dal", MealType: []string{"lunch", "dinner"}}
	dessertOnly := CatalogDish{Name: "Kheer", MealType: []string{"dessert"}}
	if !DishMatchesMealTypeFilter(lunch, "lunch_dinner") {
		t.Fatal("expected lunch/dinner dish")
	}
	if DishMatchesMealTypeFilter(dessertOnly, "lunch_dinner") {
		t.Fatal("dessert-only should not match lunch_dinner")
	}
	if ResolveEffectiveMealTypeFilter("", "") != "lunch_dinner" {
		t.Fatal("expected default lunch_dinner")
	}
	if ResolveEffectiveMealTypeFilter("lunch_dinner", "something sweet") != "dessert" {
		t.Fatal("prompt should switch to dessert")
	}
	if ResolveEffectiveMealTypeFilter("breakfast", "something sweet") != "breakfast" {
		t.Fatal("explicit breakfast should not be overridden")
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
