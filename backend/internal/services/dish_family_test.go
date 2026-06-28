package services

import "testing"

func TestDishFamilyFromCatalogField(t *testing.T) {
	d := CatalogDish{ID: "dal-tadka", Name: "Dal Tadka", DishFamily: "dal"}
	if got := DishFamily(d); got != "dal" {
		t.Fatalf("DishFamily() = %q, want dal", got)
	}
}

func TestDishFamilyDefaultsToID(t *testing.T) {
	d := CatalogDish{ID: "paneer-butter-masala", Name: "Paneer Butter Masala"}
	if got := DishFamily(d); got != "paneer-butter-masala" {
		t.Fatalf("DishFamily() = %q, want unique id", got)
	}
}

func TestResolveFamilyVariantByInventoryPrefersPantryDal(t *testing.T) {
	catalog := []CatalogDish{
		{ID: "dal-tadka", Name: "Dal Tadka", DishFamily: "dal", VariantStyle: "tadka", KeyIngredients: []string{"toor dal"}},
		{ID: "moong-dal-tadka", Name: "Moong Dal Tadka", DishFamily: "dal", VariantStyle: "tadka", KeyIngredients: []string{"moong dal"}},
	}
	picked := catalog[0]
	got := resolveFamilyVariantAmong(picked, catalog, []string{"moong dal"}, nil)
	if got.ID != "moong-dal-tadka" {
		t.Fatalf("resolveFamilyVariantAmong() = %q, want moong-dal-tadka", got.ID)
	}
}

func TestResolveFamilyVariantKeepsStyle(t *testing.T) {
	catalog := []CatalogDish{
		{ID: "masoor-dal", Name: "Masoor Dal", DishFamily: "dal", VariantStyle: "plain", KeyIngredients: []string{"masoor dal"}},
		{ID: "moong-dal-tadka", Name: "Moong Dal Tadka", DishFamily: "dal", VariantStyle: "tadka", KeyIngredients: []string{"moong dal"}},
	}
	got := resolveFamilyVariantAmong(catalog[0], catalog, []string{"moong dal"}, nil)
	if got.ID != "masoor-dal" {
		t.Fatalf("plain dal should not switch to tadka style, got %q", got.ID)
	}
}

func TestExpandExcludeByDishFamilies(t *testing.T) {
	catalog := []CatalogDish{
		{ID: "dal-tadka", Name: "Dal Tadka", DishFamily: "dal"},
		{ID: "masoor-dal", Name: "Masoor Dal", DishFamily: "dal"},
		{ID: "paneer-butter-masala", Name: "Paneer Butter Masala", DishFamily: "paneer-butter-masala"},
	}
	expanded := expandExcludeByFamilies(catalog, []string{"Dal Tadka"})
	seen := excludeDishSet(expanded)
	if !seen[NormalizeDishName("Masoor Dal")] {
		t.Fatal("expected masoor dal excluded when dal family is used")
	}
	if seen[NormalizeDishName("Paneer Butter Masala")] {
		t.Fatal("paneer should not be excluded")
	}
}
