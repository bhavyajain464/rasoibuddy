package ingredients

import "testing"

func TestCatalogLoads(t *testing.T) {
	items := Catalog()
	if len(items) < 500 {
		t.Fatalf("expected at least 500 ingredients, got %d", len(items))
	}
}

func TestSearchBySynonym(t *testing.T) {
	items := Search("tej patta")
	if len(items) == 0 {
		t.Fatal("expected match for tej patta")
	}
	found := false
	for _, item := range items {
		if item.IngredientID == "bay_leaf" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected bay_leaf in results, got %v", items)
	}
}

func TestCatalogIngredientUnits(t *testing.T) {
	var potato CatalogIngredient
	for _, item := range Search("potato") {
		if item.IngredientID == "potato" {
			potato = item
			break
		}
	}
	if potato.IngredientID == "" {
		t.Fatal("expected potato in catalog")
	}
	if potato.DefaultUnit != "kg" {
		t.Fatalf("potato default_unit = %q, want kg", potato.DefaultUnit)
	}
	if len(potato.Units) != 2 || potato.Units[0] != "kg" || potato.Units[1] != "g" {
		t.Fatalf("potato units = %v, want [kg g]", potato.Units)
	}
}

func TestDefaultUnitForCategory(t *testing.T) {
	if got := defaultUnitForCategory("vegetables"); got != "kg" {
		t.Fatalf("vegetables -> kg, got %s", got)
	}
	if got := defaultUnitForCategory("spices"); got != "g" {
		t.Fatalf("spices -> g, got %s", got)
	}
	if got := defaultUnitForCategory("eggs"); got != "pcs" {
		t.Fatalf("eggs -> pcs, got %s", got)
	}
}
