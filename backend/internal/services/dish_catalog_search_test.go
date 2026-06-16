package services

import "testing"

func TestSearchDishCatalogItemsFiltersByMealSlotAndQuery(t *testing.T) {
	pool := []DishCatalogSearchItem{
		{ID: "dal-tadka", Name: "Dal Tadka", MealTypes: []string{"lunch", "dinner"}, Cuisine: "indian", CookTimeMins: 25},
		{ID: "poha", Name: "Poha", MealTypes: []string{"breakfast"}, Cuisine: "indian", CookTimeMins: 15},
		{ID: "veg-pulao", Name: "Veg Pulao", MealTypes: []string{"lunch"}, Cuisine: "indian", CookTimeMins: 30},
	}

	breakfast := searchDishCatalogItems(pool, "", "breakfast", 10)
	if len(breakfast) != 1 || breakfast[0].ID != "poha" {
		t.Fatalf("breakfast slot: %+v", breakfast)
	}

	matches := searchDishCatalogItems(pool, "pulao", "", 10)
	if len(matches) != 1 || matches[0].ID != "veg-pulao" {
		t.Fatalf("query pulao: %+v", matches)
	}
}

func TestDishImageURL(t *testing.T) {
	got := DishImageURL("https://cdn.example.com/dishes", "dal-tadka", DishImageCard)
	want := "https://cdn.example.com/dishes/card/dal-tadka.webp"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
