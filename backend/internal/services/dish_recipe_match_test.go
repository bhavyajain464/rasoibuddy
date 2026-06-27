package services

import (
	"os"
	"testing"
)

func TestMatchCatalogDishesToRecipes(t *testing.T) {
	catalog := []CatalogDish{
		{ID: "dal-tadka", Name: "Dal Tadka"},
		{ID: "paneer-butter-masala", Name: "Paneer Butter Masala"},
		{ID: "chole-bhature-plate", Name: "Chole Bhature Plate"},
		{ID: "missing-dish", Name: "Missing Dish"},
	}
	external := []ExternalRecipe{
		{ID: "dal-tadka", Name: "Dal Tadka", URL: "https://rasoibuddy.in/dal-tadka", Ingredients: []string{"toor dal"}, Instructions: []string{"boil"}},
		{ID: "paneer-butter-masala", Name: "Paneer Butter Masala"},
		{ID: "chole-bhature", Name: "Chole Bhature"},
	}
	matched, unmatched := MatchCatalogDishesToRecipes(catalog, external)
	if len(matched) != 3 {
		t.Fatalf("matched %d, want 3", len(matched))
	}
	if len(unmatched) != 1 || unmatched[0].ID != "missing-dish" {
		t.Fatalf("unmatched: %+v", unmatched)
	}
}

func TestMatchCoverageFromRasoibuddyFile(t *testing.T) {
	path := "../../../data/rasoibuddy/recipes.json"
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Skip("rasoibuddy recipes.json not present")
	}
	external, err := ParseExternalRecipesJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	catalog := DishCatalog()
	if len(catalog) == 0 {
		t.Skip("catalog not loaded")
	}
	matched, unmatched := MatchCatalogDishesToRecipes(catalog, external)
	t.Logf("matched %d/%d, unmatched %d", len(matched), len(catalog), len(unmatched))
	if len(matched) < 150 {
		t.Fatalf("expected at least 150 matches, got %d", len(matched))
	}
}
